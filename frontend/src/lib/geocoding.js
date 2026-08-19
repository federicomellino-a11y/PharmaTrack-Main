const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_DELAY_MS = 1100;

const cache = new Map();
let queue = Promise.resolve();
let lastNominatimRequestAt = 0;
let googleLoaded = false;
let googleLoadPromise = null;
let geocoder = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadGoogleMapsGeocoder() {
  if (!GOOGLE_KEY || typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.maps?.Geocoder) {
    googleLoaded = true;
    geocoder = geocoder || new window.google.maps.Geocoder();
    return Promise.resolve(true);
  }
  if (googleLoadPromise) return googleLoadPromise;

  googleLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-google-maps="true"], script[src*="maps.googleapis.com/maps/api/js"]');

    const handleReady = () => {
      if (window.google?.maps?.Geocoder) {
        googleLoaded = true;
        geocoder = geocoder || new window.google.maps.Geocoder();
        resolve(true);
      } else {
        resolve(false);
      }
    };

    if (existing) {
      existing.addEventListener('load', handleReady, { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=it&region=IT`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'true';
    script.onload = handleReady;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return googleLoadPromise;
}

function pickBestGoogleResult(results) {
  if (!results?.length) return null;
  // Preferisci risultati a livello civico (ROOFTOP/RANGE_INTERPOLATED) e non parziali
  const rank = (r) => {
    const lt = r?.geometry?.location_type;
    const hasStreetNumber = (r?.types || []).includes('street_address') ||
      (r?.address_components || []).some((c) => (c.types || []).includes('street_number'));
    let score = 0;
    if (lt === 'ROOFTOP') score += 100;
    else if (lt === 'RANGE_INTERPOLATED') score += 70;
    else if (lt === 'GEOMETRIC_CENTER') score += 30;
    else score += 10; // APPROXIMATE
    if (hasStreetNumber) score += 40;
    if (r?.partial_match) score -= 25;
    return score;
  };
  return [...results].sort((a, b) => rank(b) - rank(a))[0];
}

async function fetchGoogleCoordinates(address) {
  const ready = googleLoaded || await loadGoogleMapsGeocoder();
  if (!ready || !geocoder) return null;

  return new Promise((resolve, reject) => {
    geocoder.geocode(
      {
        address,
        region: 'IT',
        componentRestrictions: { country: 'IT' },
      },
      (results, status) => {
        if (status === 'OK' && results?.length) {
          const best = pickBestGoogleResult(results);
          const location = best?.geometry?.location;
          if (location) {
            resolve({ lat: location.lat(), lng: location.lng() });
            return;
          }
        }

        if (status === 'ZERO_RESULTS') {
          resolve(null);
          return;
        }

        reject(new Error(`Google geocoding failed: ${status}`));
      }
    );
  });
}

async function fetchNominatimCoordinates(address) {
  const elapsed = Date.now() - lastNominatimRequestAt;
  const waitMs = Math.max(0, MIN_DELAY_MS - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    addressdetails: '1',
    countrycodes: 'it',
    q: address,
  });

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'it',
    },
  });

  lastNominatimRequestAt = Date.now();

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

function normalizeItalianAddress(address) {
  const a = (address || '').trim();
  if (!a) return a;
  return /ital(y|ia)/i.test(a) ? a : `${a}, Italia`;
}

async function fetchCoordinates(address) {
  const normalized = normalizeItalianAddress(address);
  if (GOOGLE_KEY) {
    try {
      const googleCoords = await fetchGoogleCoordinates(normalized);
      if (googleCoords) return googleCoords;
    } catch {
      // fallback to Nominatim
    }
  }

  return fetchNominatimCoordinates(normalized);
}

export function geocodeAddress(address) {
  const normalized = address?.trim();
  if (!normalized) {
    return Promise.resolve(null);
  }

  const cacheKey = normalized.toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const task = queue
    .catch(() => null)
    .then(() => fetchCoordinates(normalized))
    .catch((error) => {
      cache.delete(cacheKey);
      throw error;
    });

  queue = task.then(() => null, () => null);
  cache.set(cacheKey, task);
  return task;
}

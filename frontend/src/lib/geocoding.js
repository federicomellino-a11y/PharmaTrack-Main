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
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
          return;
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

async function fetchCoordinates(address) {
  if (GOOGLE_KEY) {
    try {
      const googleCoords = await fetchGoogleCoordinates(address);
      if (googleCoords) return googleCoords;
    } catch {
      // fallback to Nominatim
    }
  }

  return fetchNominatimCoordinates(address);
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

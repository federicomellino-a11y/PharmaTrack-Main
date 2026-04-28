import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ensureArray } from '@/lib/collections';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

let mapsLoadPromise = null;

function loadGoogleMaps() {
  if (mapsLoadPromise) return mapsLoadPromise;
  if (window.__googleMapsReady) return Promise.resolve(true);
  mapsLoadPromise = new Promise((resolve) => {
    if (window.google?.maps?.places) {
      window.__googleMapsReady = true;
      return resolve(true);
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      existing.addEventListener('load', () => { window.__googleMapsReady = true; resolve(true); });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places&language=it&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => { window.__googleMapsReady = true; resolve(true); };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

async function fetchLegacySuggestions(input, places) {
  if (!places?.AutocompleteService) return null;
  return new Promise((resolve) => {
    const svc = new places.AutocompleteService();
    svc.getPlacePredictions(
      { input, componentRestrictions: { country: 'it' }, types: ['address'], language: 'it' },
      (predictions, status) => {
        if (status === places.PlacesServiceStatus.OK && predictions) resolve(predictions);
        else resolve(null);
      }
    );
  });
}

async function fetchGoogleSuggestions(input) {
  const places = window.google?.maps?.places;
  if (!places) return null;

  // New Places API (post-March 2025 keys)
  if (places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    try {
      const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        region: 'it',
        includedRegionCodes: ['it'],
      });
      if (suggestions && suggestions.length > 0) {
        return suggestions.map((s) => {
          const pred = s.placePrediction;
          return {
            place_id: pred.placeId,
            description: pred.text?.text || pred.mainText?.text || '',
            structured_formatting: {
              main_text: pred.mainText?.text || '',
              secondary_text: pred.secondaryText?.text || '',
            },
            _newApi: true,
            _prediction: pred,
          };
        });
      }
      // Empty result from new API → try legacy
    } catch {
      // 403 or other error from new API → try legacy
    }
  }

  // Legacy Places API (old key or new API unavailable)
  const legacy = await fetchLegacySuggestions(input, places);
  if (legacy) return legacy;

  return null;
}

async function fetchGoogleDetails(prediction) {
  const places = window.google?.maps?.places;
  if (!places) return null;

  if (prediction._newApi && prediction._prediction?.toPlace) {
    try {
      const place = prediction._prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });
      const components = place.addressComponents || [];
      const get = (type) => components.find((c) => c.types.includes(type))?.longText || '';
      const street = get('route');
      const num = get('street_number');
      const city = get('locality') || get('administrative_area_level_3');
      const cap = get('postal_code');
      const formatted = [street && num ? `${street} ${num}` : street, cap, city].filter(Boolean).join(', ');
      return {
        address: formatted || place.formattedAddress,
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      };
    } catch (e) {
      console.warn('[AddressAutocomplete] fetchFields failed', e);
      return { address: prediction.description, lat: null, lng: null };
    }
  }

  // Legacy PlacesService
  if (places.PlacesService) {
    return new Promise((resolve) => {
      const div = document.createElement('div');
      const svc = new places.PlacesService(div);
      svc.getDetails(
        { placeId: prediction.place_id, fields: ['formatted_address', 'address_components', 'geometry'] },
        (place, status) => {
          if (status === places.PlacesServiceStatus.OK && place) {
            const components = place.address_components || [];
            const get = (t) => components.find((c) => c.types.includes(t))?.long_name || '';
            const street = get('route');
            const num = get('street_number');
            const cap = get('postal_code');
            const city = get('locality') || get('administrative_area_level_3');
            const formatted = [street && num ? `${street} ${num}` : street, cap, city].filter(Boolean).join(', ');
            resolve({
              address: formatted || place.formatted_address,
              lat: place.geometry?.location?.lat(),
              lng: place.geometry?.location?.lng(),
            });
          } else {
            resolve({ address: prediction.description, lat: null, lng: null });
          }
        }
      );
    });
  }

  return { address: prediction.description, lat: null, lng: null };
}

async function fetchNominatim(val) {
  const params = new URLSearchParams({ format: 'json', limit: '6', addressdetails: '1', countrycodes: 'it', q: val });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'Accept-Language': 'it', Accept: 'application/json' },
  });
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((item) => {
    const road = item.address?.road || '';
    const num = item.address?.house_number || '';
    const city = item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || '';
    const postcode = item.address?.postcode || '';
    const mainText = road ? `${road}${num ? ' ' + num : ''}` : item.display_name.split(',')[0];
    return {
      place_id: String(item.place_id),
      description: item.display_name,
      structured_formatting: { main_text: mainText, secondary_text: [city, postcode].filter(Boolean).join(', ') },
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      _nominatim: true,
    };
  });
}

export default function AddressAutocomplete({
  value, onChange, onAddressSelect,
  label = 'Indirizzo',
  placeholder = 'Via Rossi 119, Volla (NA)',
  required = false, className = '', id = 'address'
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [usingGoogle, setUsingGoogle] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);
  const safeSuggestions = ensureArray(suggestions);

  useEffect(() => {
    if (!GOOGLE_KEY) return;
    loadGoogleMaps().then((ok) => { if (ok) setUsingGoogle(true); });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (val) => {
    if (val.length < 3) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      let results = null;
      if (GOOGLE_KEY && usingGoogle) {
        results = await fetchGoogleSuggestions(val);
      }
      if (!results) {
        results = await fetchNominatim(val);
      }
      setSuggestions(results || []);
      setOpen((results?.length || 0) > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [usingGoogle]);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = async (prediction) => {
    setSuggestions([]);
    setOpen(false);

    if (prediction._nominatim) {
      const addr = [prediction.structured_formatting.main_text, prediction.structured_formatting.secondary_text]
        .filter(Boolean).join(', ');
      setQuery(addr);
      onChange(addr);
      onAddressSelect?.({ address: addr, lat: prediction.lat, lng: prediction.lng, placeId: null, raw: prediction });
      return;
    }

    // Google (new or legacy)
    setLoading(true);
    const details = await fetchGoogleDetails(prediction);
    setLoading(false);
    if (details) {
      setQuery(details.address);
      onChange(details.address);
      onAddressSelect?.({ address: details.address, lat: details.lat, lng: details.lng, placeId: prediction.place_id, raw: prediction });
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <Label htmlFor={id} className="mb-1 block text-sm font-medium">
          {label}{required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          value={query}
          onChange={handleChange}
          onFocus={() => safeSuggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          required={required}
          className="pl-9 pr-9"
          autoComplete="off"
          autoCorrect="off"
          data-testid="address-input"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && safeSuggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
          {safeSuggestions.map((pred) => {
            const main = pred.structured_formatting?.main_text || pred.description.split(',')[0];
            const sub = pred.structured_formatting?.secondary_text || '';
            return (
              <li
                key={pred.place_id}
                onMouseDown={() => handleSelect(pred)}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors border-b border-border/50 last:border-0"
              >
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{main}</p>
                  {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                </div>
              </li>
            );
          })}
          <li className="px-3 py-1.5 flex items-center justify-end gap-1">
            {usingGoogle ? (
              <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3_hdpi.png" alt="Google" className="h-3 opacity-40" />
            ) : (
              <span className="text-[10px] text-muted-foreground/50">© OpenStreetMap</span>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}

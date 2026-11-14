import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API } from '@/lib/config';
import { safeInvalidateSize } from '@/lib/leafletSafe';
import { geocodeAddress as geocodeWithRateLimit } from '@/lib/geocoding';
import { ensureArray, ensureObject } from '@/lib/collections';

/* La mappa dei clienti.
   Stava dentro la Home, dove occupava mezza schermata senza che nessuno la
   guardasse mentre preparava le consegne: adesso vive nella sua pagina e la
   Home resta alle cose del giorno. Il comportamento non cambia: coordinate
   lette dal cliente, geocodifica una volta sola e salvata sul cliente. */

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const customerIcon = new L.DivIcon({
  className: '',
  html: '<div style="background:hsl(172,66%,33%);width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [12, 12], iconAnchor: [6, 6],
});

const pharmacyIcon = new L.DivIcon({
  className: '',
  html: '<div style="background:hsl(45,93%,47%);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>',
  iconSize: [16, 16], iconAnchor: [8, 8],
});

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) safeInvalidateSize(map); };
    const t = setTimeout(run, 200);
    const h = () => setTimeout(run, 100);
    window.addEventListener('resize', h);
    return () => {
      alive = false;
      clearTimeout(t);
      window.removeEventListener('resize', h);
    };
  }, [map]);
  return null;
}

export default function MappaClienti({ customers = [], user, altezza = 'h-[420px]' }) {
  const [customerCoords, setCustomerCoords] = useState({});
  const [pharmacyCoords, setPharmacyCoords] = useState(null);
  const mapKey = useRef(`mappa-clienti-${Date.now()}`);

  const caricaCoordinate = useCallback(async (customer) => {
    if (!customer?.customer_id) return;
    if (customer.customer_lat != null && customer.customer_lng != null) {
      setCustomerCoords((prev) => ({
        ...prev,
        [customer.customer_id]: { lat: customer.customer_lat, lng: customer.customer_lng },
      }));
      return;
    }
    const coords = await geocodeWithRateLimit(customer?.address);
    if (!coords) return;
    setCustomerCoords((prev) => ({ ...prev, [customer.customer_id]: coords }));
    // Salvato sul cliente: la prossima volta non si geocodifica di nuovo.
    axios.put(`${API}/customers/${customer.customer_id}`,
      { customer_lat: coords.lat, customer_lng: coords.lng },
      { withCredentials: true }).catch(() => null);
  }, []);

  useEffect(() => {
    const clienti = ensureArray(customers);
    if (!clienti.length) return;
    setCustomerCoords({});
    clienti.slice(0, 20).forEach((customer) => {
      caricaCoordinate(customer).catch(() => null);
    });
  }, [customers, caricaCoordinate]);

  useEffect(() => {
    let mounted = true;
    const caricaFarmacia = async () => {
      if (user?.pharmacy_lat != null && user?.pharmacy_lng != null) {
        if (mounted) setPharmacyCoords({ lat: user.pharmacy_lat, lng: user.pharmacy_lng });
        return;
      }
      const coords = await geocodeWithRateLimit(user?.pharmacy_address);
      if (mounted && coords) setPharmacyCoords(coords);
    };
    if (user?.pharmacy_address || (user?.pharmacy_lat != null && user?.pharmacy_lng != null)) {
      caricaFarmacia().catch(() => null);
    }
    return () => { mounted = false; };
  }, [user]);

  const posizioni = Object.entries(ensureObject(customerCoords));
  const primo = posizioni[0]?.[1];
  const centro = pharmacyCoords
    ? [pharmacyCoords.lat, pharmacyCoords.lng]
    : primo
      ? [primo.lat, primo.lng]
      : [40.8833, 14.4761];

  return (
    <div className="overflow-hidden rounded-2xl border border-border" data-testid="mappa-clienti">
      <div className={altezza}>
        <MapContainer key={mapKey.current} center={centro} zoom={13} className="h-full w-full" zoomControl={false}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizer />
          {pharmacyCoords && (
            <Marker position={[pharmacyCoords.lat, pharmacyCoords.lng]} icon={pharmacyIcon}>
              <Popup>
                <div className="text-center text-xs">
                  <strong>📍 {user?.pharmacy_name || 'Farmacia'}</strong><br />{user?.pharmacy_address}
                </div>
              </Popup>
            </Marker>
          )}
          {posizioni.map(([id, c]) => {
            const cliente = ensureArray(customers).find((x) => x.customer_id === id);
            if (!cliente) return null;
            return (
              <Marker key={id} position={[c.lat, c.lng]} icon={customerIcon}>
                <Popup>
                  <div className="text-xs"><strong>{cliente.name}</strong><br />{cliente.address}</div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400"></span>La tua farmacia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary"></span>Clienti
        </span>
        <span className="ml-auto">{posizioni.length} clienti sulla mappa</span>
      </div>
    </div>
  );
}

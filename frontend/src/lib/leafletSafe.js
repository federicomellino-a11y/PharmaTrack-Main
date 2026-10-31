/**
 * Leaflet si rompe se invalidateSize() arriva quando la mappa non ha piu il
 * suo mapPane (componente smontato, tab in background, container a 0 px).
 * Questa guardia evita il crash "_leaflet_pos of undefined" che su mobile
 * mandava in schermata bianca la dashboard.
 */
export function safeInvalidateSize(map) {
  if (!map) return;
  try {
    const container = map.getContainer?.();
    if (!container || !container.isConnected || !container.offsetWidth) return;
    if (!map.getPane?.('mapPane')) return;
    map.invalidateSize();
  } catch {
    /* mappa gia smontata: niente da fare */
  }
}

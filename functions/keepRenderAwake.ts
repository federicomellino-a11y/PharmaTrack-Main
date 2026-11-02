/**
 * Tiene sveglio il backend PharmaTrack su Render.
 *
 * Il piano free di Render spegne l'istanza dopo 15 minuti di silenzio: la prima
 * richiesta dopo la pausa paga il risveglio (decine di secondi) e sembra che
 * l'applicazione sia lenta. Un ping leggero ogni pochi minuti evita la pausa
 * senza toccare il codice dell'app.
 *
 * Gira come workflow schedulato; restituisce sempre 200 con la latenza, anche
 * se il backend non risponde, cosi' un singolo errore non mette in errore il
 * workflow.
 */
export default async function keepRenderAwake(req) {
  const url = 'https://pharmatrack-api.onrender.com/api/health';
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000); // un risveglio da freddo puo' durare ~50s
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'pharmatrack-keepalive' } });
    clearTimeout(timer);
    const elapsed = Date.now() - started;
    let body = null;
    try { body = await res.json(); } catch { /* risposta non JSON: non e' un problema per il ping */ }
    const cold = elapsed > 5000;
    return {
      ok: res.ok,
      status: res.status,
      elapsed_ms: elapsed,
      verosimilmente_spento: cold,
      database: body?.database ?? null,
      note: cold
        ? 'Risposta lenta: probabilmente l\'istanza Render era spenta e si e\' risvegliata.'
        : 'Istanza gia\' sveglia.',
    };
  } catch (error) {
    return {
      ok: false,
      elapsed_ms: Date.now() - started,
      errore: error?.name === 'AbortError' ? 'timeout 55s' : String(error?.message || error),
    };
  }
}

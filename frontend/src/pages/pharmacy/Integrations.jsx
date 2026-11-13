import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useWinfarmStatusQuery } from '@/hooks/queries';
import { Layout } from '../../components/Layout';
import ProGate from '../../components/ProGate';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Download, Monitor, Loader2, RefreshCw, CircleDot } from 'lucide-react';
import { toast } from 'sonner';
import { API } from '@/lib/config';

const formatWhen = (iso) => {
  if (!iso) return 'mai';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'mai';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `oggi alle ${time}` : `${d.toLocaleDateString('it-IT')} alle ${time}`;
};

// Download di un file dal backend. Unico punto della pagina che usa axios
// direttamente: sono file, non letture di elenco, quindi non vanno in cache.
async function scaricaFile(percorso, nomeFile, tipo) {
  const res = await axios.get(`${API}${percorso}`, { withCredentials: true, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function Metrica({ etichetta, valore, sotto }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <p className="text-sm font-semibold mt-0.5">{valore}</p>
      {sotto && <p className="text-[11px] text-muted-foreground leading-tight">{sotto}</p>}
    </div>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadingApp, setDownloadingApp] = useState(false);
  const [downloadingScript, setDownloadingScript] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const queryClient = useQueryClient();
  const { data: winfarmData, isLoading: winfarmLoading } = useWinfarmStatusQuery();
  useEffect(() => {
    setStatus(winfarmData || null);
    setLoading(winfarmLoading);
  }, [winfarmData, winfarmLoading]);

  const loadStatus = () => queryClient.invalidateQueries({ queryKey: ['winfarm-status'] });

  // Il programma per il PC: zip con l'eseguibile e la sua chiave gia' dentro.
  const downloadApp = async () => {
    setDownloadingApp(true);
    try {
      const base = encodeURIComponent(window.location.origin);
      await scaricaFile(`/integrations/winfarm/app/download?base=${base}`,
        'pharmatrack-consegna-veloce.zip', 'application/zip');
      toast.success('Scaricato: apri lo zip e fai doppio clic su consegna-veloce.exe');
    } catch {
      toast.error('Download non riuscito, riprova');
    } finally {
      setDownloadingApp(false);
    }
  };

  // Resta per chi vuole la lettura automatica della finestra: lo script non ha
  // bisogno di selezionare niente, ma va avviato con PowerShell.
  const downloadScript = async () => {
    setDownloadingScript(true);
    try {
      const base = encodeURIComponent(window.location.origin);
      await scaricaFile(`/integrations/winfarm/tray/download?base=${base}`,
        'pharmatrack-consegna-veloce.ps1', 'application/octet-stream');
      toast.success('Script scaricato: tasto destro sul file, Esegui con PowerShell');
    } catch {
      toast.error('Download non riuscito, riprova');
    } finally {
      setDownloadingScript(false);
    }
  };

  // Rigenerare la chiave stacca il PC che ce l'ha: e' la via per quando il
  // computer cambia o quando il file di configurazione finisce dove non doveva.
  const rigeneraChiave = async () => {
    const conferma = window.confirm(
      'Rigenerare la chiave? Il programma su quel PC smette di funzionare finché non lo scarichi di nuovo.');
    if (!conferma) return;
    setRevoking(true);
    try {
      const risposta = await axios.post(`${API}/integrations/winfarm/token/rotate`, {}, { withCredentials: true });
      setStatus((precedente) => ({
        ...(precedente || {}),
        token_configurato: true,
        token_preview: risposta.data?.token_preview,
        bridge_online: false,
      }));
      loadStatus();
      toast.success('Chiave rigenerata: riscarica il programma sul PC');
    } catch {
      toast.error('Non sono riuscito a rigenerare la chiave, riprova');
    } finally {
      setRevoking(false);
    }
  };

  // "Collegato" non puo' voler dire "ha importato almeno una volta": un
  // programma fermo da un mese lascerebbe la pagina verde per sempre.
  const giorniDa = (iso) => {
    if (!iso) return null;
    const quando = new Date(iso);
    if (Number.isNaN(quando.getTime())) return null;
    return Math.floor((Date.now() - quando.getTime()) / 86400000);
  };
  // Se il programma batte, lo stato e' un fatto; se non batte (o e' una
  // versione che non lo sa fare) si ricade sull'ultimo import.
  const vivo = status?.bridge_online === true;
  const ultimoBattito = status?.bridge_last_seen ? formatWhen(status.bridge_last_seen) : null;
  const giorni = giorniDa(status?.last_import);
  const active = vivo || (giorni !== null && giorni <= 7);
  const sotto = `Ultimo import ${formatWhen(status?.last_import)}${status?.last_import_customer ? ` · ${status.last_import_customer}` : ''}`;
  const stato = vivo
    ? { testo: 'Programma collegato', sotto: `Ultimo giro ${ultimoBattito}`, badge: 'Attivo' }
    : giorni === null
      ? null
      : giorni <= 1
        ? { testo: 'Collegato a Winfarm', sotto, badge: 'Attivo' }
        : { testo: `Fermo da ${giorni} giorni`, sotto, badge: 'Da controllare' };

  return (
    <Layout title="Integrazioni">
      {/* Integrazioni e' una funzione Professional. Il lucchetto non e' solo
          grafico: import e riconoscimento rispondono 402 dal backend. */}
      <ProGate funzione="integrazioni">
      <div className="space-y-6 animate-fade-in-up max-w-3xl" data-testid="integrations-page">
        <div>
          <h1 className="text-xl font-bold">Integrazioni</h1>
          <p className="text-sm text-muted-foreground mt-1">Da Winfarm a consegna, senza riscrivere.</p>
        </div>

        {/* Stato: compare solo quando il programma si e' collegato almeno una volta */}
        {(loading || stato) && <Card className={active ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-primary/20 bg-primary/[0.03]'}>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CircleDot className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {loading ? 'Controllo stato…' : stato?.testo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {loading ? 'Un attimo…' : stato?.sotto}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={active ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : ''}>
                  {stato?.badge}
                </Badge>
                <Button variant="ghost" size="sm" onClick={loadStatus} aria-label="Aggiorna stato">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/60">
              <Metrica etichetta="Oggi" valore={status?.imports_today ?? 0} sotto="importate" />
              <Metrica etichetta="In totale" valore={status?.imports_total ?? 0} sotto="da sempre" />
            </div>
          </CardContent>
        </Card>}

        <Card data-testid="pulsante-magico-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Consegna veloce Winfarm</p>
                  <p className="text-xs text-muted-foreground">Programma per il PC del banco, Windows 10 o 11. Niente da installare prima.</p>
                </div>
              </div>
              <Button size="sm" className="gap-2" onClick={downloadApp} disabled={downloadingApp} data-testid="scarica-pulsante-magico">
                {downloadingApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Scarica
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2" data-testid="pulsante-magico-istruzioni">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Si installa una volta</p>
                <ol className="space-y-1.5 text-sm list-decimal pl-4 marker:text-muted-foreground">
                  <li>Scarica lo zip e aprilo: dentro ci sono il programma e la sua chiave.</li>
                  <li>Doppio clic su <b>consegna-veloce.exe</b>. Vicino all’orologio compare la croce verde.</li>
                  <li>Tasto destro sulla croce → <b>Avvio automatico con Windows</b>.</li>
                  <li>Su quel PC resta collegato a PharmaTrack in Chrome o Edge.</li>
                </ol>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Si usa così</p>
                <ol className="space-y-1.5 text-sm list-decimal pl-4 marker:text-muted-foreground">
                  <li>In Winfarm tieni aperta la vendita e <b>seleziona le righe</b>, cliente compreso.</li>
                  <li>Premi <kbd className="px-1 rounded bg-secondary text-[11px] font-mono">Ctrl+Shift+C</kbd>.</li>
                  <li>Compare l’avviso “Consegna creata”: in PharmaTrack resta da mettere pagamento e indirizzo.</li>
                  <li>Se il cliente non è in anagrafica, il programma apre la scheda per aggiungerlo con l’indirizzo.</li>
                </ol>
              </div>
            </div>

            <ul className="text-xs text-muted-foreground space-y-1 border-t pt-3">
              <li>Cliente non in anagrafica: lo aggiungi dalla scheda, con l’indirizzo.</li>
              <li>La stessa vendita non entra due volte: lo scontrino viene riconosciuto.</li>
              <li>Per cambiare tasto: tasto destro sulla croce → Cambia tasto.</li>
              <li>Il programma si aggiorna da solo, senza reinstallare niente.</li>
            </ul>

            {/* La chiave del PC: si vede tagliata e si puo' revocare. */}
            <div className="border-t pt-3 space-y-2" data-testid="chiave-del-pc">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">Chiave di questo PC</p>
                  <p className="text-[11px] text-muted-foreground">
                    {status?.token_preview
                      ? `${status.token_preview} · ${status.bridge_online ? 'collegato adesso' : 'in attesa di collegarsi'}`
                      : 'Nasce al primo download del programma.'}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-2" onClick={rigeneraChiave}
                  disabled={revoking || !status?.token_configurato} data-testid="rigenera-chiave">
                  {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Rigenera
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Rigenerandola, il programma su quel PC smette di funzionare finché non lo scarichi di nuovo.
                Serve quando il computer cambia o quando il file è finito dove non doveva.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              C’è anche la versione che legge la finestra da sola, senza selezionare niente:{' '}
              <button type="button" onClick={downloadScript} disabled={downloadingScript}
                className="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
                data-testid="scarica-script-finestra">
                {downloadingScript ? 'scarico…' : 'scarica lo script (.ps1)'}
              </button>
              , va avviata con PowerShell.
            </p>
          </CardContent>
        </Card>
      </div>
      </ProGate>
    </Layout>
  );
}

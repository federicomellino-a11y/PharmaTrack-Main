import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useWinfarmStatusQuery } from '@/hooks/queries';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Pill, Download, CheckCircle2, Keyboard, Monitor, Zap, Loader2,
  RefreshCw, CircleDot, ArrowRight, ExternalLink, FlaskConical, Code2,
} from 'lucide-react';
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

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4">
      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">{n}</div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
        <div className="text-xs text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingTray, setDownloadingTray] = useState(false);
  const [testoProva, setTestoProva] = useState('');
  const [esitoProva, setEsitoProva] = useState(null);
  const [analizzando, setAnalizzando] = useState(false);
  const [testing, setTesting] = useState(false);

  const queryClient = useQueryClient();
  const { data: winfarmData, isLoading: winfarmLoading } = useWinfarmStatusQuery();
  useEffect(() => {
    setStatus(winfarmData || null);
    setLoading(winfarmLoading);
  }, [winfarmData, winfarmLoading]);

  const loadStatus = () => queryClient.invalidateQueries({ queryKey: ['winfarm-status'] });

  const downloadBridge = async () => {
    setDownloading(true);
    try {
      const base = window.location.origin;
      const res = await axios.get(`${API}/integrations/winfarm/bridge/download?base=${encodeURIComponent(base)}`, {
        withCredentials: true, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pharmatrack-bridge-winfarm.ahk';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Bridge scaricato: avvialo con doppio click');
    } catch {
      toast.error('Download non riuscito, riprova');
    } finally {
      setDownloading(false);
    }
  };

  const downloadTray = async () => {
    setDownloadingTray(true);
    try {
      const base = window.location.origin;
      const res = await axios.get(`${API}/integrations/winfarm/tray/download?base=${encodeURIComponent(base)}`, {
        withCredentials: true, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pharmatrack-pulsante-magico.ps1';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Pulsante magico scaricato: mettilo in una cartella fissa e avvialo');
    } catch {
      toast.error('Download non riuscito, riprova');
    } finally {
      setDownloadingTray(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const { data } = await axios.post(`${API}/integrations/winfarm/import`, {
        cliente: 'CLIENTE DI PROVA',
        telefono: '3330000000',
        importo: 12.5,
        note: 'Prova bridge Winfarm',
        pagamento: 'cash',
      }, { withCredentials: true });
      toast.success(`Prova ok: consegna creata da ${data?.customer?.name || 'cliente di prova'}`);
      loadStatus();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Prova non riuscita');
    } finally {
      setTesting(false);
    }
  };

  const active = !!status?.last_import;

  return (
    <Layout title="Integrazioni">
      <div className="space-y-5 animate-fade-in-up max-w-3xl" data-testid="integrations-page">
        <div>
          <h1 className="text-xl font-bold">Collega Winfarm</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Un file, un doppio click, una scorciatoia. Da lì in poi le vendite finiscono in PharmaTrack da sole.
          </p>
        </div>

        {/* Stato */}
        <Card className={active ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-primary/20 bg-primary/[0.03]'}>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CircleDot className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {loading ? 'Controllo stato…' : active ? 'Bridge attivo' : 'Pronto da configurare'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {active
                    ? `${status.imports_today} import oggi · ultima ${formatWhen(status.last_import)}`
                    : 'Ti servono 60 secondi, qui sotto'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={active ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : ''}>
                {active ? 'Collegato' : 'Non collegato'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={loadStatus} aria-label="Aggiorna stato">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3 passi */}
        <div className="space-y-2">
          <Step n="1" title="Scarica il bridge già configurato">
            <p>
              Contiene già l'indirizzo della tua farmacia e la tua chiave: non devi modificare niente.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" className="btn-primary gap-2" onClick={downloadBridge} disabled={downloading}>
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Scarica bridge
              </Button>
              <a
                href="https://www.autohotkey.com/download/ahk-install.exe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline underline-offset-2 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                Serve AutoHotkey? Installalo una volta sola <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </Step>

          <Step n="2" title="Doppio click sul file">
            <p>
              Compare l'icona verde <strong>H</strong> vicino all'orologio: il bridge è in ascolto. Per averlo sempre attivo
              metti il file nella cartella <code className="px-1 py-0.5 bg-secondary rounded">Esecuzione automatica</code> di Windows
              (<span className="whitespace-nowrap">Win+R</span> → <code className="px-1 py-0.5 bg-secondary rounded">shell:startup</code>).
            </p>
          </Step>

          <Step n="3" title="In Winfarm: seleziona la vendita e premi Alt+C">
            <p className="flex flex-wrap items-center gap-1.5">
              <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono inline-flex items-center gap-1"><Keyboard className="w-3 h-3" />Alt + C</kbd>
              importa la consegna ·
              <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">Alt + D</kbd>
              apre il Dock di banco
            </p>
            <p>La consegna arriva in coda “Da preparare” e il Dock si aggiorna in tempo reale. Se la selezione non viene riconosciuta, si apre il modulo già compilato.</p>
          </Step>
        </div>

        {/* Pulsante magico */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">Pulsante magico (icona e tasto)</p>
                  <p className="text-xs text-muted-foreground">
                    Legge la vendita da solo: niente selezione, niente Alt+C.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={downloadTray} disabled={downloadingTray}>
                {downloadingTray ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Scarica pulsante magico
              </Button>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5 pl-1">
              <li className="flex gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Gia configurato: indirizzo e chiave sono dentro al file. Si mette in una cartella fissa e si avvia
                  con PowerShell: nessuna installazione, nessun AutoHotkey.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span className="flex flex-wrap items-center gap-1.5">
                  In Winfarm premi
                  <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono inline-flex items-center gap-1">
                    <Keyboard className="w-3 h-3" />Ctrl + Shift + C
                  </kbd>
                  oppure doppio clic sull'icona vicino all'orologio.
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Se cliente o totale non si leggono, non crea niente e te lo dice: meglio un errore chiaro di una
                  consegna sbagliata.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Prova */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FlaskConical className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Prova che tutto funzioni</p>
                <p className="text-xs text-muted-foreground">Crea una consegna di prova: la trovi in Consegne, la cancelli in un click.</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={runTest} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Crea consegna di prova
            </Button>
          </CardContent>
        </Card>

        {/* Senza installare nulla */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Monitor className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Non vuoi installare niente?</p>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Apri il Dock accanto a Winfarm e inserisci le consegne a mano: stessa coda, stesso flusso, zero installazioni.
                </p>
                <Button size="sm" variant="outline" className="gap-2" asChild>
                  <a href="/dock">
                    Apri il Dock <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avanzate */}
        <details className="rounded-xl border border-border bg-card">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center gap-2">
            <Code2 className="w-4 h-4 text-muted-foreground" /> Per sviluppatori / altri gestionali
          </summary>
          <div className="px-4 pb-4 space-y-3 text-xs text-muted-foreground">
            <p>
              Qualsiasi software può creare una consegna con una chiamata REST autenticata dalla sessione farmacia:
            </p>
            <pre className="bg-secondary rounded-lg p-3 overflow-x-auto text-[11px] leading-relaxed">
{`POST ${API}/integrations/winfarm/import

{
  "cliente": "ROSSI MARIO",
  "telefono": "3331234567",
  "indirizzo": "Via Roma 5, Milano",
  "importo": 18.50,
  "pagamento": "cash",      // cash | pos
  "note": "Antibiotico",
  "ricevuta": "1234"
}`}
            </pre>
            <p>
              Alias accettati: <code>cliente/customer_name</code>, <code>telefono/customer_phone</code>,
              <code>importo/amount</code>, <code>pagamento/payment_method</code>, <code>note/notes</code>.
              La consegna nasce in stato “Da preparare” e il cliente viene creato se non esiste.
            </p>
          </div>
        </details>

        {/* Prova con una vendita vera: e' cosi' che si tarano le regole */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary" />
                Prova con una vendita vera
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Apri una vendita in Winfarm, seleziona i dati del cliente e copiali qui con
                {' '}<kbd className="px-1 rounded bg-secondary text-[10px]">Ctrl+C</kbd>. Ti dico cosa ho
                riconosciuto, senza creare nessuna consegna.
              </p>
            </div>
            <textarea
              value={testoProva}
              onChange={(e) => setTestoProva(e.target.value)}
              rows={5}
              placeholder={'Cliente: Mario Rossi\nIndirizzo: Via Roma 12, Napoli\nTelefono: 333 111 2233\nTotale: 18,50\nPagamento: Contanti'}
              className="w-full rounded-lg border border-input bg-background p-2 text-xs font-mono"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={analizzando || !testoProva.trim()}
                onClick={async () => {
                  setAnalizzando(true);
                  try {
                    const r = await axios.post(`${API}/integrations/winfarm/parse`,
                      { testo: testoProva }, { withCredentials: true });
                    setEsitoProva(r.data);
                  } catch {
                    toast.error('Riconoscimento non riuscito');
                  } finally {
                    setAnalizzando(false);
                  }
                }}
              >
                {analizzando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Analizza
              </Button>
              {esitoProva && (
                <span className={`text-xs font-medium ${esitoProva.utilizzabile ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {esitoProva.utilizzabile
                    ? `${esitoProva.riconosciuti.length} campi riconosciuti`
                    : 'Manca qualcosa per fare la consegna'}
                </span>
              )}
            </div>
            {esitoProva && (
              <div className="space-y-1.5 pt-1">
                {[
                  ['Cliente', esitoProva.campi.cliente],
                  ['Indirizzo', esitoProva.campi.indirizzo],
                  ['Telefono', esitoProva.campi.telefono],
                  ['Codice fiscale', esitoProva.campi.codice_fiscale],
                  ['Importo', esitoProva.campi.importo != null ? `€ ${Number(esitoProva.campi.importo).toFixed(2)}` : null],
                  ['Pagamento', esitoProva.campi.pagamento],
                  ['Ricette', esitoProva.campi.ricette],
                ].map(([etichetta, valore]) => (
                  <div key={etichetta} className="flex items-baseline gap-2 text-xs">
                    <span className="w-28 shrink-0 text-muted-foreground">{etichetta}</span>
                    <span className={valore ? 'font-medium' : 'text-muted-foreground/60'}>
                      {valore || 'non riconosciuto'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Chiave bridge: <code className="px-1 bg-secondary rounded">{status?.token_preview || '—'}</code>
          {status?.pharmacy_name ? ` · ${status.pharmacy_name}` : ''}
        </p>
      </div>
    </Layout>
  );
}

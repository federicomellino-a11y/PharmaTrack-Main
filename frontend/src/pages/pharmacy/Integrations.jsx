import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useWinfarmStatusQuery } from '@/hooks/queries';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Download, CheckCircle2, Keyboard, Monitor, Zap, Loader2, RefreshCw, CircleDot,
  ArrowRight, ExternalLink, Code2, KeyRound, FileSpreadsheet,
  MessageCircle, CalendarClock, Receipt, Printer,
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

function Passo({ n, children }) {
  return (
    <li className="flex gap-2">
      <span className="w-4 h-4 rounded-full bg-secondary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <span className="text-xs text-muted-foreground">{children}</span>
    </li>
  );
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

// Integrazioni non ancora attive. Sono qui per dire dove si sta andando, con
// la stessa sincerità del resto della pagina: nessun pulsante che non fa niente.
const IDEE = [
  {
    icona: FileSpreadsheet,
    titolo: 'Import da CSV o Excel',
    testo: 'Per i gestionali che non si chiamano Winfarm: mappatura delle colonne e anteprima prima di creare le consegne.',
    tag: 'Resa alta',
  },
  {
    icona: MessageCircle,
    titolo: 'Avviso al cliente su WhatsApp',
    testo: 'Il cliente riceve il link di tracciamento da solo, senza che nessuno lo chiami dalla cassa.',
    tag: 'Resa alta',
  },
  {
    icona: CalendarClock,
    titolo: 'Turni nel calendario',
    testo: 'I turni dei fattorini finiscono nel calendario che hanno già sul telefono: niente più foto del foglio.',
    tag: 'Resa media',
  },
  {
    icona: Receipt,
    titolo: 'Fatture a fine mese',
    testo: 'Le consegne del mese diventano righe di fattura senza ricopiarle a mano nel programma di fatturazione.',
    tag: 'Resa media',
  },
  {
    icona: Printer,
    titolo: 'Etichette per i colli',
    testo: 'Etichetta con nome, indirizzo e numero d\'ordine stampata dalla coda, senza riscrivere niente.',
    tag: 'Resa media',
  },
];

export default function IntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingTray, setDownloadingTray] = useState(false);

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
      const base = encodeURIComponent(window.location.origin);
      await scaricaFile(`/integrations/winfarm/bridge/download?base=${base}`,
        'pharmatrack-bridge-winfarm.ahk', 'text/plain;charset=utf-8');
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
      const base = encodeURIComponent(window.location.origin);
      await scaricaFile(`/integrations/winfarm/tray/download?base=${base}`,
        'pharmatrack-pulsante-magico.ps1', 'application/octet-stream');
      toast.success('Pulsante magico scaricato: mettilo in una cartella fissa e avvialo');
    } catch {
      toast.error('Download non riuscito, riprova');
    } finally {
      setDownloadingTray(false);
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
  const giorni = giorniDa(status?.last_import);
  const active = giorni !== null && giorni <= 7;
  const stato = giorni === null
    ? { testo: 'Pronto da collegare', sotto: 'Scegli una delle due strade qui sotto: servono due minuti', badge: 'Da attivare' }
    : giorni <= 1
      ? { testo: 'Collegato a Winfarm', sotto: `Ultimo import ${formatWhen(status.last_import)}${status.last_import_customer ? ` · ${status.last_import_customer}` : ''}`, badge: 'Attivo' }
      : { testo: `Fermo da ${giorni} giorni`, sotto: `Ultimo import ${formatWhen(status.last_import)}${status.last_import_customer ? ` · ${status.last_import_customer}` : ''}`, badge: 'Da controllare' };

  return (
    <Layout title="Integrazioni">
      <div className="space-y-6 animate-fade-in-up max-w-3xl" data-testid="integrations-page">
        <div>
          <h1 className="text-xl font-bold">Integrazioni</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Da qui entra il lavoro che fai già in Winfarm. Una vendita diventa una consegna senza riscriverla.
          </p>
        </div>

        {/* Stato */}
        <Card className={active ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-primary/20 bg-primary/[0.03]'}>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CircleDot className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {loading ? 'Controllo stato…' : stato.testo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {loading ? 'Un attimo…' : stato.sotto}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={active ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : ''}>
                  {stato.badge}
                </Badge>
                <Button variant="ghost" size="sm" onClick={loadStatus} aria-label="Aggiorna stato">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/60">
              <Metrica etichetta="Oggi" valore={status?.imports_today ?? 0} sotto="importate" />
              <Metrica etichetta="In totale" valore={status?.imports_total ?? 0} sotto="da sempre" />
              <Metrica etichetta="Chiave del PC" valore={<span className="font-mono text-xs">{status?.token_preview || '—'}</span>} sotto="questo computer" />
            </div>
          </CardContent>
        </Card>

        {/* Due modi */}
        <div>
          <h2 className="font-semibold text-sm">Come far entrare una vendita</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Due strade, stesso risultato: la consegna nasce in coda “Da preparare”. Scegli quella che ti fa perdere meno tempo al banco.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Pulsante magico */}
          <Card className="border-primary/30">
            <CardContent className="p-4 flex flex-col gap-3 h-full">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">Pulsante magico</p>
                    <Badge className="text-[10px] px-1.5 py-0">Consigliato</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Legge la vendita da solo. Niente selezione, niente AutoHotkey.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 flex-1">
                <Passo n="1">Scarica il file: indirizzo e chiave sono già dentro.</Passo>
                <Passo n="2">
                  Mettilo in una cartella fissa e avvialo con PowerShell: compare l’icona vicino all’orologio.
                </Passo>
                <Passo n="3">
                  In Winfarm premi <kbd className="px-1 rounded bg-secondary text-[10px] font-mono">Ctrl+Shift+C</kbd> o fai doppio clic sull’icona.
                </Passo>
              </ul>
              <Button size="sm" className="btn-primary gap-2 w-full" onClick={downloadTray} disabled={downloadingTray}>
                {downloadingTray ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Scarica pulsante magico
              </Button>
            </CardContent>
          </Card>

          {/* Bridge Alt+C */}
          <Card>
            <CardContent className="p-4 flex flex-col gap-3 h-full">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Bridge Alt+C</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Il metodo collaudato: selezioni i dati in Winfarm e premi Alt+C.
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 flex-1">
                <Passo n="1">Scarica il bridge: indirizzo e chiave sono già dentro.</Passo>
                <Passo n="2">Serve AutoHotkey, una volta sola, e un doppio clic sul file.</Passo>
                <Passo n="3">
                  In Winfarm seleziona la vendita e premi <kbd className="px-1 rounded bg-secondary text-[10px] font-mono">Alt+C</kbd>.
                </Passo>
              </ul>
              <div className="space-y-2">
                <Button size="sm" variant="outline" className="gap-2 w-full" onClick={downloadBridge} disabled={downloading}>
                  {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Scarica bridge
                </Button>
                <a
                  href="https://www.autohotkey.com/download/ahk-install.exe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] underline underline-offset-2 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  Serve AutoHotkey? Installalo una volta sola <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Senza installare */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Non vuoi installare niente?</p>
                <p className="text-xs text-muted-foreground">
                  Apri il Dock accanto a Winfarm e inserisci la consegna a mano: stessa coda, stesso flusso.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-2" asChild>
              <a href="/dock">
                Apri il Dock <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Per sviluppatori */}
        <details className="rounded-xl border border-border bg-card">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center gap-2">
            <Code2 className="w-4 h-4 text-muted-foreground" /> Per sviluppatori e altri gestionali
          </summary>
          <div className="px-4 pb-4 space-y-3 text-xs text-muted-foreground">
            <p>
              Tre endpoint, tutti sotto <code className="px-1 bg-secondary rounded">/api/integrations/winfarm</code>.
              I campi del cliente vanno nel corpo JSON: una via che oggi usa ancora la query string
              e' il vecchio script AutoHotkey, che va migrato.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Metodo</th>
                    <th className="py-1 pr-3 font-medium">Endpoint</th>
                    <th className="py-1 font-medium">Cosa fa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono">GET</td>
                    <td className="py-1.5 pr-3 font-mono">/status</td>
                    <td className="py-1.5">Stato del collegamento e conteggi</td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono">POST</td>
                    <td className="py-1.5 pr-3 font-mono">/parse</td>
                    <td className="py-1.5">Legge i testi di una vendita e restituisce i campi riconosciuti</td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono">POST</td>
                    <td className="py-1.5 pr-3 font-mono">/import</td>
                    <td className="py-1.5">Crea la consegna</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong className="text-foreground">Autenticazione.</strong>
              <code className="px-1 bg-secondary rounded mx-1">/parse</code> e
              <code className="px-1 bg-secondary rounded mx-1">/bridge</code> accettano la sessione della farmacia
              (cookie) oppure, per i programmi che girano sul PC, l’header
              <code className="px-1 bg-secondary rounded mx-1">X-Bridge-Token</code> con la chiave del bridge.
              <code className="px-1 bg-secondary rounded mx-1">/import</code> vuole la sessione: un gestionale
              desktop usa <code className="px-1 bg-secondary rounded mx-1">/bridge</code>.
            </p>
            <pre className="bg-secondary rounded-lg p-3 overflow-x-auto text-[11px] leading-relaxed">
{`POST /api/integrations/winfarm/import

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
            <p className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Chiave di questa farmacia: <code className="px-1 bg-secondary rounded">{status?.token_preview || '—'}</code>
              {status?.pharmacy_name ? ` · ${status.pharmacy_name}` : ''}
            </p>
          </div>
        </details>

        {/* Idee */}
        <div className="pt-1">
          <h2 className="font-semibold text-sm">Altre integrazioni in valutazione</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Non sono attive: sono le prossime candidate, in ordine di quanto toglierebbero di fatica al banco.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {IDEE.map(({ icona: Icona, titolo, testo, tag }) => (
            <div key={titolo} className="rounded-xl border border-border bg-card p-3 flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Icona className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{titolo}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{testo}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          Dimmi quale ti serve davvero e la metto in fila: si parte da quella che ti fa risparmiare più tempo.
        </p>
      </div>
    </Layout>
  );
}

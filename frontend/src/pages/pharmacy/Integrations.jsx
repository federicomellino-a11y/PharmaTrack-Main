import React, { useState, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Plug, Download, Copy, CheckCircle2, Terminal, Keyboard, Workflow,
  AlertCircle, FileCode, Zap, ExternalLink, Pill,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

export default function IntegrationsPage() {
  const { user } = useAuth();
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const [previewUrl, setPreviewUrl] = useState(`${baseUrl}/deliveries?new=1&customer_name=ROSSI%20MARIO&customer_phone=3331234567&amount=18.50&payment_method=cash&notes=Antibiotico`);
  const [copied, setCopied] = useState(false);

  const ahkUrl = `${baseUrl}/pharmatrack_winfarm.ahk`;

  const exampleParams = [
    { key: 'customer_name', label: 'Nome cliente', example: 'ROSSI MARIO' },
    { key: 'customer_phone', label: 'Telefono', example: '3331234567' },
    { key: 'customer_address', label: 'Indirizzo', example: 'Via Roma 5' },
    { key: 'amount', label: 'Importo €', example: '18.50' },
    { key: 'payment_method', label: 'Pagamento', example: 'cash | pos' },
    { key: 'notes', label: 'Note', example: 'Antibiotico + ricetta' },
  ];

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    toast.success('Copiato negli appunti');
  };

  return (
    <Layout title="Integrazioni">
      <div className="space-y-6 animate-fade-in-up max-w-4xl" data-testid="integrations-page">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />Integrazioni
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Collega PharmaTrack ai gestionali e alle utility che già usi in farmacia.
          </p>
        </div>

        {/* WINFARM */}
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Pill className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="font-bold text-lg">Winfarm (Pharmaservice)</h2>
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs">Beta</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Winfarm non espone API. Il "ponte" funziona via <strong>hotkey + clipboard</strong>: dopo la vendita, premi una combinazione e PharmaTrack si apre con il modulo "Nuova Consegna" già pre-compilato.
                </p>
              </div>
            </div>

            {/* Step 1: Download */}
            <div className="rounded-xl border border-border bg-card p-4 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-1">Scarica AutoHotkey + lo script</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    AutoHotkey è gratuito, leggero (~3 MB) e funziona su qualsiasi PC Windows della farmacia. Va installato una sola volta.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-2" asChild>
                      <a href="https://www.autohotkey.com/download/ahk-install.exe" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />Installa AutoHotkey
                      </a>
                    </Button>
                    <Button size="sm" className="btn-primary gap-2" asChild>
                      <a href={ahkUrl} download="pharmatrack_winfarm.ahk">
                        <Download className="w-3.5 h-3.5" />Scarica script bridge
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Configure */}
            <div className="rounded-xl border border-border bg-card p-4 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-1">Configura l'URL della tua farmacia nello script</h3>
                  <p className="text-xs text-muted-foreground mb-2">Apri il file <code className="px-1.5 py-0.5 bg-secondary rounded">pharmatrack_winfarm.ahk</code> con Blocco Note e cambia la riga:</p>
                  <div className="bg-secondary rounded-lg px-3 py-2 font-mono text-xs flex items-center justify-between gap-2">
                    <code className="truncate">PharmaTrackURL := "{baseUrl}"</code>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(`PharmaTrackURL := "${baseUrl}"`)}>
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Salva e fai doppio-click sul file per avviarlo: in basso a destra apparirà un'icona verde "H".
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Use */}
            <div className="rounded-xl border border-border bg-card p-4 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                    <Keyboard className="w-4 h-4 text-primary" />Usa l'hotkey <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">Ctrl + F10</kbd>
                  </h3>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Su Winfarm, dopo aver chiuso la vendita, <strong>seleziona col mouse</strong> la riga/blocco con cliente e importo</li>
                    <li>Premi <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px] font-mono">Ctrl + F10</kbd></li>
                    <li>Si apre PharmaTrack con il modulo "Nuova Consegna" già compilato</li>
                    <li>Completa metodo di pagamento, eventuale resto, e clic su Crea</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Test deep link */}
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-4 h-4 text-primary mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-2">Prova subito un deep-link di esempio</h3>
                  <Input
                    value={previewUrl}
                    onChange={(e) => setPreviewUrl(e.target.value)}
                    className="font-mono text-xs mb-2"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(previewUrl)}>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />Copia
                    </Button>
                    <Button size="sm" className="btn-primary" asChild>
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Prova ora
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PARAMETERS reference */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-bold mb-1 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary" />Parametri supportati nell'URL
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Puoi costruire i tuoi link verso <code className="px-1.5 py-0.5 bg-secondary rounded text-xs">/deliveries?new=1&amp;…</code> con questi parametri. Se il <em>nome</em> o <em>telefono</em> coincidono con un cliente esistente, viene selezionato automaticamente; altrimenti vedi la barra di ricerca pre-filtrata.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {exampleParams.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary/50">
                  <div>
                    <code className="text-xs font-mono font-semibold text-primary">{p.key}</code>
                    <p className="text-xs text-muted-foreground">{p.label}</p>
                  </div>
                  <code className="text-xs font-mono text-foreground/70">{p.example}</code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* API direct */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-bold mb-1 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />Integrazione via API (avanzato)
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Se preferisci chiamare un endpoint REST direttamente dal tuo bridge (Python, PowerShell, Node, ecc.), invia un POST a:
            </p>
            <div className="bg-secondary rounded-lg px-3 py-2 font-mono text-xs flex items-center justify-between gap-2 mb-3">
              <code className="truncate">POST {baseUrl}/api/integrations/winfarm/import</code>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(`${baseUrl}/api/integrations/winfarm/import`)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Body JSON di esempio:</p>
            <pre className="bg-zinc-950 text-zinc-100 rounded-lg p-3 text-xs font-mono overflow-x-auto">{`{
  "customer_name": "ROSSI MARIO",
  "customer_phone": "3331234567",
  "customer_address": "Via Roma 5, Roma",
  "amount": 18.50,
  "payment_method": "cash",
  "notes": "Antibiotico + ricetta",
  "external_ref": "SCONTRINO-2026-04-30-0042"
}`}</pre>
            <p className="text-xs text-muted-foreground mt-2">
              Richiede autenticazione cookie session (oppure header <code>Authorization: Bearer &lt;token&gt;</code>) della farmacia. Se il cliente non esiste con il nome/telefono inviato, viene creato in automatico.
            </p>
          </CardContent>
        </Card>

        {/* Note legali */}
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm mb-1">Note sull'integrazione Winfarm</h3>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>L'integrazione non legge il database Winfarm né si interfaccia con il software in modo invasivo: usa solo la clipboard di Windows e l'apertura di un URL nel browser predefinito.</li>
                  <li>Il riconoscimento di cliente e importo dipende dal layout della tua schermata Winfarm: se i pattern non funzionano, le regex sono modificabili nel file <code>.ahk</code> con un editor di testo.</li>
                  <li>PharmaTrack non è un prodotto Pharmaservice: marchio Winfarm e relative funzionalità appartengono ai rispettivi proprietari.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

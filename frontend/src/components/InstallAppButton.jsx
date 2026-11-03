import React, { useEffect, useState } from 'react';
import { Download, Share2, MoreVertical, MonitorDown, CheckCircle2, Smartphone } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';


const isIos = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
};

const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

/**
 * Istruzioni manuali quando il browser non concede beforeinstallprompt.
 * Succede su iOS (dove il prompt non esiste) e su Chrome dopo una
 * disinstallazione, quando il browser aspetta di nuovo i suoi criteri di
 * coinvolgimento prima di riproporre l'installazione. Il pulsante nativo e'
 * la via principale; questo e' il piano B sempre disponibile.
 */
export function InstallInstructions({ open, onOpenChange }) {
  const ios = isIos();
  const android = isAndroid();
  const steps = ios
    ? [
        { icon: Share2, testo: 'Tocca l\'icona Condividi nella barra di Safari.' },
        { icon: Smartphone, testo: 'Scorri e scegli "Aggiungi a Home", poi conferma con "Aggiungi".' },
      ]
    : android
      ? [
          { icon: MoreVertical, testo: 'Apri il menu con i tre puntini in alto a destra in Chrome.' },
          { icon: Download, testo: 'Tocca "Installa app" (su alcuni telefoni "Aggiungi a schermata Home").' },
        ]
      : [
          { icon: MonitorDown, testo: 'Su Chrome o Edge guarda l\'icona di installazione nella barra degli indirizzi, a destra dell\'URL.' },
          { icon: Download, testo: 'In alternativa: menu del browser, poi "Installa PharmaTrack".' },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Installare PharmaTrack</DialogTitle>
          <DialogDescription>
            {ios
              ? 'Su iPhone e iPad l\'installazione si fa da Safari, in due tocchi.'
              : android
                ? 'Su Android Chrome si installa dal menu del browser.'
                : 'Dal browser del computer si installa in un passaggio.'}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-3 items-start">
              <span className="mt-0.5 w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <step.icon className="w-4 h-4" />
              </span>
              <span className="text-muted-foreground">{step.testo}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Se il browser non mostra "Installa", chiudi tutte le schede di PharmaTrack e riprova: dopo una
          disinstallazione Chrome aspetta un po' prima di riproporre il prompt, ma il menu resta disponibile.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pulsante di installazione. Se il browser ha già concesso il prompt nativo
 * (beforeinstallprompt) basta un tocco; altrimenti apre le istruzioni.
 */
export function InstallAppButton({ variant = 'outline', size = 'sm', className = '', showLabel = true, onDone }) {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [busy, setBusy] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    if (isInstalled && onDone) onDone();
  }, [isInstalled, onDone]);

  if (isInstalled) {
    return (
      <span className={`${className} inline-flex items-center gap-2 text-xs text-muted-foreground`}>
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        {showLabel ? 'App installata' : null}
      </span>
    );
  }

  const handleClick = async () => {
    if (!isInstallable) {
      setHintOpen(true);
      return;
    }
    setBusy(true);
    try {
      const result = await install();
      if (result?.outcome === 'accepted') {
        toast.success('PharmaTrack installata');
        if (onDone) onDone();
      } else if (result?.outcome === 'dismissed') {
        toast.message('Installazione annullata');
      } else {
        setHintOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        disabled={busy}
        data-testid="install-app-button"
        title="Installa PharmaTrack come app"
      >
        <Download className="w-4 h-4 sm:mr-2" />
        {showLabel ? (
          <span className="hidden sm:inline">
            {busy ? 'Preparazione...' : isInstallable ? 'Installa app' : 'Come installare'}
          </span>
        ) : null}
      </Button>
      <InstallInstructions open={hintOpen} onOpenChange={setHintOpen} />
    </>
  );
}

export default InstallAppButton;

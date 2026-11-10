import React, { useCallback, useState } from 'react';
import { Download, Share2, MoreVertical, Smartphone } from 'lucide-react';
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

// Su Android e desktop il prompt e' l'unico modo per installare con un tocco:
// nessuna API permette a un sito di installarsi da solo. Se il browser non lo
// concede (succede dopo una disinstallazione, finche' non tornano i suoi
// criteri) l'unica strada resta il menu del browser: una riga, non un dialogo.
const messaggioMenu = () => (isAndroid()
  ? 'Per installarla: menu ⋮ di Chrome, poi "Installa app"'
  : 'Per installarla: icona di installazione nella barra degli indirizzi, oppure menu del browser');

/**
 * Istruzioni passo-passo, usate solo su iOS dove il prompt non esiste.
 */
export function InstallInstructions({ open, onOpenChange }) {
  const ios = isIos();
  const steps = ios
    ? [
        { icon: Share2, testo: 'Tocca l\'icona Condividi nella barra di Safari.' },
        { icon: Smartphone, testo: 'Scorri e scegli "Aggiungi a Home", poi conferma con "Aggiungi".' },
      ]
    : [
        { icon: MoreVertical, testo: 'Apri il menu del browser (⋮ o i tre puntini).' },
        { icon: Download, testo: 'Scegli "Installa app".' },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Installare PharmaTrack</DialogTitle>
          <DialogDescription>
            {ios ? 'Su iPhone e iPad si installa da Safari, in due tocchi.' : 'Dal browser si installa in un passaggio.'}
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
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pulsante di installazione: un tocco quando il browser concede il prompt.
 * Se l'app e' gia' installata non mostra niente.
 */
export function InstallAppButton({ variant = 'outline', size = 'sm', className = '', showLabel = true, onDone }) {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [busy, setBusy] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  const handleClick = useCallback(async () => {
    if (!isInstallable) {
      // Prova a sbloccare il prompt: aggiornare il service worker e' cio' che
      // serve quando il browser non ha ancora riletto il sw.js nuovo.
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => registrations.forEach((registration) => registration.update?.()))
          .catch(() => null);
      }
      if (isIos()) {
        setHintOpen(true);
      } else {
        toast.message(messaggioMenu(), { duration: 7000 });
      }
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
      }
    } finally {
      setBusy(false);
    }
  }, [install, isInstallable, onDone]);

  // Installata: niente scritte, il pulsante sparisce.
  if (isInstalled) return null;

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
          <span className="hidden sm:inline">{busy ? 'Preparazione...' : 'Installa app'}</span>
        ) : null}
      </Button>
      <InstallInstructions open={hintOpen} onOpenChange={setHintOpen} />
    </>
  );
}

export default InstallAppButton;

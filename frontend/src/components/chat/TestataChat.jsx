import { Badge } from '../ui/badge';
import { Wifi, WifiOff } from 'lucide-react';

/** Titolo della pagina e i due gesti della conversazione aperta. */
export default function TestataChat({ driverId, threadClosed, connected, onNuova, onChiudi }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Chat fattorini</h1>
        <p className="text-sm text-muted-foreground">Messaggi rapidi per indirizzi, note cliente, pagamenti e aggiornamenti operativi.</p>
      </div>
      {driverId && (
        <div className="flex w-fit gap-2" data-testid="chat-thread-actions">
          <button type="button" onClick={onNuova}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            data-testid="chat-new-button">+ Nuova chat</button>
          <button type="button" onClick={onChiudi}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
            data-testid="chat-close-button">Chiudi chat</button>
          {threadClosed && (
            <span className="self-center rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700">
              Chiusa
            </span>
          )}
        </div>
      )}
      <Badge variant={connected ? 'secondary' : 'outline'} className="w-fit gap-2 px-3 py-1">
        {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {connected ? 'Tempo reale attivo' : 'Riconnessione in corso'}
      </Badge>
    </div>

  );
}

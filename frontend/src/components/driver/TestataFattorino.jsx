import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback } from '../ui/avatar';

/** La testata della dashboard fattorino: chi sei e il tasto per aggiornare. */
export default function TestataFattorino({ driver, refreshing = false, onAggiorna }) {
  return (
  <header className="sticky top-0 z-40 glass px-4 py-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="w-10 h-10">
          <AvatarFallback className="bg-teal-500/20 text-teal-400">
            {driver?.name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-white">{driver?.name}</p>
          <p className="text-xs text-zinc-500">{driver?.vehicle_type}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onAggiorna}
          disabled={refreshing}
          className="text-zinc-400"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  </header>
  );
}

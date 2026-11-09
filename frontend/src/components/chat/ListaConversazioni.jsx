import { Search } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { CircleDot } from 'lucide-react';
import { formatConversationTime } from '@/lib/chatMessages';

/** La colonna dei fattorini: ricerca, elenco, non letti. Non carica niente da sola. */
export default function ListaConversazioni({ driverId, conversazioni = [], cerca = '', onCerca, onSeleziona }) {
  return (
    <Card className={`${driverId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col`}>
      <CardHeader className="gap-3 border-b pb-4">
        <div>
          <CardTitle className="text-lg">Conversazioni</CardTitle>
          <p className="text-sm text-muted-foreground">{conversazioni.length} fattorini disponibili</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={cerca}
            onChange={(event) => onCerca(event.target.value)}
            placeholder="Cerca fattorino…"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {conversazioni.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nessun fattorino trovato.
            </div>
          ) : conversazioni.map((conversation) => (
            <button
              key={conversation.driver_id}
              onClick={() => onSeleziona(conversation)}
              className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                driverId === conversation.driver_id
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:border-border hover:bg-secondary/60'
              }`}
              data-testid={`chat-driver-${conversation.driver_id}`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {conversation.driver_name?.charAt(0) || 'F'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-foreground">{conversation.driver_name}</p>
                    <span className="text-[11px] text-muted-foreground">{formatConversationTime(conversation.last_message_at)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <CircleDot className={`h-3 w-3 ${conversation.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                    <span className="truncate">{conversation.vehicle_type || 'Fattorino'}</span>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {conversation.last_message
                        ? `${conversation.last_sender_type === 'pharmacy' ? 'Tu: ' : ''}${conversation.last_message}`
                        : 'Nessun messaggio ancora inviato'}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

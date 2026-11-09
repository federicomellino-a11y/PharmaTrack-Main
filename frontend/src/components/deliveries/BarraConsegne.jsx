import { Download, Euro, Filter, MapPin, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

/**
 * La testata della pagina Consegne: i numeri del giorno, i filtri e le schede.
 * Riceve tutto dall'alto: qui dentro non si legge niente e non si decide niente.
 */
export default function BarraConsegne({
  attive = 0,
  inAttesa = 0,
  daConfermare = 0,
  inAggiornamento = false,
  inRiparazione = false,
  cerca = '',
  fattorino = 'all',
  fattorini = [],
  scheda = 'active',
  onAggiorna,
  onNuova,
  onCerca,
  onFattorino,
  onEsporta,
  onRipara,
  onScheda,
}) {
  return (
    <>
  {/* Header */}
  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
    <div>
      <h1 className="text-xl font-bold">Consegne</h1>
      <p className="text-sm text-muted-foreground">
        {attive} attive · {inAttesa} in attesa
        {daConfermare > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-xs">
            <Euro className="w-3 h-3" />{daConfermare} da confermare incasso
          </span>
        )}
      </p>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onAggiorna} disabled={inAggiornamento}>
        <RefreshCw className={`w-4 h-4 mr-1.5 ${inAggiornamento ? 'animate-spin' : ''}`} />
        Aggiorna
      </Button>
      <Button className="btn-primary hidden sm:inline-flex" size="sm" onClick={onNuova}>
        <Plus className="w-4 h-4 mr-1.5" />Nuova Consegna
      </Button>
    </div>
  </div>

  {/* Filters */}
  <div className="flex flex-col sm:flex-row gap-2">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input placeholder="Cerca cliente, indirizzo, note..." value={cerca}
        onChange={e => onCerca(e.target.value)} className="pl-9 h-9" />
    </div>
    <Select value={fattorino} onValueChange={onFattorino}>
      <SelectTrigger className="w-full sm:w-44 h-9">
        <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
        <SelectValue placeholder="Fattorino" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tutti i fattorini</SelectItem>
        <SelectItem value="unassigned">Non assegnate</SelectItem>
        {fattorini.filter(d => d.is_active).map(d => (
          <SelectItem key={d.driver_id} value={d.driver_id}>{d.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button
      variant="outline"
      size="sm"
      className="h-10 sm:h-9 w-full sm:w-auto"
      onClick={onEsporta}
      data-testid="export-deliveries-csv"
    >
      <Download className="w-4 h-4 mr-1.5" />Esporta CSV
    </Button>
    <Button
      variant="outline"
      size="sm"
      className="h-10 sm:h-9 w-full sm:w-auto"
      onClick={onRipara}
      disabled={inRiparazione}
      title="Ricalcola le coordinate delle consegne aperte con indirizzi approssimativi"
      data-testid="repair-coordinates"
    >
      <MapPin className="w-4 h-4 mr-1.5" />{inRiparazione ? 'Riparo...' : 'Ripara indirizzi'}
    </Button>
    <Tabs value={scheda} onValueChange={onScheda} className="w-full sm:w-auto">
      <TabsList className="h-10 sm:h-9 w-full sm:w-auto">
        <TabsTrigger value="active" className="flex-1 sm:flex-none text-[11px] sm:text-xs px-2 sm:px-3">Attive {attive > 0 && <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-primary/15 text-primary font-bold">{attive}</span>}</TabsTrigger>
        <TabsTrigger value="pending_confirmation" className="flex-1 sm:flex-none text-[11px] sm:text-xs px-2 sm:px-3">
          <Euro className="w-3 h-3 mr-1" />Da incassare
          {daConfermare > 0 && <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">{daConfermare}</span>}
        </TabsTrigger>
        <TabsTrigger value="completed" className="flex-1 sm:flex-none text-[11px] sm:text-xs px-2 sm:px-3">Completate</TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
    </>
  );
}

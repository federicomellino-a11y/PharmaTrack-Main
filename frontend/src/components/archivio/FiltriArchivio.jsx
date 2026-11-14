import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PERIODI, STATI_ARCHIVIO, PAGAMENTI_ARCHIVIO, quantiFiltri } from '@/lib/archivioFiltri';

/**
 * La barra dei filtri dell'Archivio.
 *
 * Riceve i filtri dall'alto e li restituisce cambiati: qui dentro non si legge
 * niente dal server e non si decide niente. Ricerca e filtri li applica il
 * backend su tutto l'archivio, quindi ogni scelta fa una richiesta nuova.
 */
export default function FiltriArchivio({
  cerca = '',
  filtri = {},
  fattorini = [],
  totale = 0,
  inAggiornamento = false,
  onCerca,
  onFiltro,
  onAzzera,
}) {
  const accesi = quantiFiltri({ ...filtri, q: cerca });
  const attivi = fattorini.filter((d) => d?.is_active !== false);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca cliente, indirizzo, telefono, note o ricetta..."
            value={cerca}
            onChange={(e) => onCerca(e.target.value)}
            className="pl-9 h-9"
            aria-label="Cerca nell'archivio"
            data-testid="search-archive"
          />
        </div>
        <Select value={filtri.periodo} onValueChange={(v) => onFiltro('periodo', v)}>
          <SelectTrigger className="w-full sm:w-44 h-9" data-testid="filtro-periodo">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            {PERIODI.map((p) => (
              <SelectItem key={p.valore} value={p.valore}>{p.etichetta}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Select value={filtri.stato} onValueChange={(v) => onFiltro('stato', v)}>
          <SelectTrigger className="w-full h-9" data-testid="filtro-stato">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti gli stati</SelectItem>
            {STATI_ARCHIVIO.map((s) => (
              <SelectItem key={s.valore} value={s.valore}>{s.etichetta}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtri.fattorino} onValueChange={(v) => onFiltro('fattorino', v)}>
          <SelectTrigger className="w-full h-9" data-testid="filtro-fattorino">
            <SelectValue placeholder="Fattorino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i fattorini</SelectItem>
            {attivi.map((d) => (
              <SelectItem key={d.driver_id} value={d.driver_id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtri.pagamento} onValueChange={(v) => onFiltro('pagamento', v)}>
          <SelectTrigger className="w-full h-9" data-testid="filtro-pagamento">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i pagamenti</SelectItem>
            {PAGAMENTI_ARCHIVIO.map((p) => (
              <SelectItem key={p.valore} value={p.valore}>{p.etichetta}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-8">
        <p className="text-xs text-muted-foreground" data-testid="conteggio-archivio">
          {inAggiornamento
            ? 'Aggiornamento...'
            : `${totale} ${totale === 1 ? 'consegna' : 'consegne'}${accesi > 0 ? ' con questi filtri' : ' in archivio'}`}
        </p>
        {accesi > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onAzzera}
            data-testid="azzera-filtri-archivio"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Azzera {accesi === 1 ? 'il filtro' : `i ${accesi} filtri`}
          </Button>
        )}
      </div>
    </div>
  );
}

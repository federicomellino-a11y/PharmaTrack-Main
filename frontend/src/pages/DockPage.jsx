import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeliveriesQuery, useDriversQuery } from '@/hooks/queries';
import axios from 'axios';
import { API } from '@/lib/config';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Truck, Plus, RefreshCw, Search, Euro, CheckCircle2, Zap, MapPin } from 'lucide-react';
import { toast } from 'sonner';


const STATI_SMISTARE = ['da_preparare', 'pending', 'pronta'];
const STATI_IN_CONSEGNA = ['picked_up', 'in_transit'];

const ETICHETTE_STATO = {
  picked_up: 'Ritirata',
  in_transit: 'In consegna',
};

export default function DockPage() {
  const queryClient = useQueryClient();
  const { data: deliveries = [] } = useDeliveriesQuery();
  const { data: drivers = [] } = useDriversQuery();
  const [assigning, setAssigning] = useState(null); // delivery selezionata per assegnazione
  const [confirming, setConfirming] = useState(null); // delivery in conferma incasso
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  // I tre contatori in alto sono filtri veri: uno solo per volta decide cosa
  // mostra l'elenco sotto. Prima "Da smistare" azzerava la ricerca e gli altri
  // due non facevano nulla.
  const [filtro, setFiltro] = useState('smistare');

  useEffect(() => { document.title = 'PharmaTrack Dock'; }, []);

  // auto-refresh leggero ogni 30s (mantiene anche il backend caldo)
  useEffect(() => {
    const t = setInterval(() => queryClient.invalidateQueries({ queryKey: ['deliveries'] }), 30000);
    return () => clearInterval(t);
  }, [queryClient]);

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    await queryClient.invalidateQueries({ queryKey: ['drivers'] });
    setTimeout(() => setRefreshing(false), 400);
  };

  const prioRank = (d) => ({ urgent: 0, high: 1, normal: 2, low: 3 }[d.priority || 'normal'] ?? 2);
  const perOrario = (a, b) =>
    prioRank(a) - prioRank(b) ||
    (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99') ||
    (a.created_at || '').localeCompare(b.created_at || '');

  const tutte = useMemo(() => (deliveries || []), [deliveries]);

  // Coda da smistare: attive, senza fattorino, ordinate per priorita' reale poi orario
  const queue = useMemo(() => {
    return tutte
      .filter(d => STATI_SMISTARE.includes(d.status) && !d.driver_id)
      .sort(perOrario);
  }, [tutte]);

  // L'elenco mostrato: la ricerca vale solo sulla coda da smistare, dove serve
  // trovare il cliente al volo. Sugli altri due filtri sarebbe un filtro in piu'
  // che nasconde righe senza dirlo.
  const queueVisibile = useMemo(() => {
    const termine = search.trim().toLowerCase();
    if (!termine) return queue;
    return queue.filter(d => (d.customer_name || '').toLowerCase().includes(termine));
  }, [queue, search]);

  const inConsegna = useMemo(
    () => tutte.filter(d => STATI_IN_CONSEGNA.includes(d.status)).sort(perOrario),
    [tutte]);

  const daIncassare = useMemo(
    () => tutte.filter(d => d.status === 'delivered_pending_confirmation')
      .sort((a, b) => (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99')),
    [tutte]);

  const activeDrivers = useMemo(() => (drivers || []).filter(d => d.is_active), [drivers]);

  const load = (driverId) => (deliveries || []).filter(
    d => d.driver_id === driverId && ['assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status)
  ).length;

  const counts = useMemo(() => ({
    smistare: queue.length,
    in_consegna: inConsegna.length,
    incassare: daIncassare.length,
  }), [queue, inConsegna, daIncassare]);

  const assign = async (driver) => {
    if (!assigning) return;
    try {
      await axios.put(`${API}/deliveries/${assigning.delivery_id}`, { driver_id: driver.driver_id }, { withCredentials: true });
      toast.success(`${assigning.customer_name} → ${driver.name}`);
      setAssigning(null);
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    } catch { toast.error('Errore assegnazione'); }
  };

  const quickCapture = () => {
    window.open(`${window.location.origin}/quick`, 'pt_quick', 'width=440,height=680');
  };

  const confirmPayment = async (d) => {
    try {
      await axios.post(`${API}/deliveries/${d.delivery_id}/confirm-payment`, { confirmed_amount: d.amount }, { withCredentials: true });
      toast.success(`Incasso confermato: ${d.customer_name}`);
      setConfirming(null);
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    } catch { toast.error('Errore conferma incasso'); }
  };

  const nomeFattorino = (delivery) => (drivers || []).find(dr => dr.driver_id === delivery.driver_id)?.name || 'Fattorino non assegnato';
  const importo = (valore) => (valore != null ? `€${Number(valore).toFixed(2)}` : '');

  const contatori = [
    { chiave: 'smistare', etichetta: 'DA SMISTARE', valore: counts.smistare },
    { chiave: 'in_consegna', etichetta: 'IN CONSEGNA', valore: counts.in_consegna },
    { chiave: 'incassare', etichetta: 'DA INCASSARE', valore: counts.incassare },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground p-3 flex flex-col gap-3 max-w-md mx-auto">
      {/* Header: contatori. Ognuno apre il proprio elenco. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 flex-1" role="group" aria-label="Filtri del dock">
          {contatori.map(({ chiave, etichetta, valore }) => {
            const attivo = filtro === chiave;
            return (
              <button
                key={chiave}
                type="button"
                onClick={() => setFiltro(chiave)}
                aria-pressed={attivo}
                data-testid={`dock-contatore-${chiave}`}
                className={`flex-1 rounded-xl border p-2 text-center transition-colors ${
                  attivo
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <p className={`text-xl font-bold tabular-nums ${attivo ? 'text-primary' : ''}`}>{valore}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{etichetta}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Azioni */}
      <div className="flex gap-2">
        <Button onClick={quickCapture} className="flex-1 h-10" data-testid="dock-quick-capture">
          <Plus className="w-4 h-4 mr-1.5" />Nuova
        </Button>
        <Button variant="outline" onClick={refresh} className="h-10 w-10 p-0" title="Aggiorna">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Promemoria cassa: resta in vista quando si sta smistando */}
      {filtro === 'smistare' && daIncassare.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setFiltro('incassare')}
            className="w-full px-3 py-1.5 text-[10px] font-semibold text-muted-foreground bg-secondary flex items-center gap-1.5 hover:bg-accent"
          >
            <Euro className="w-3 h-3" />DA INCASSARE · {daIncassare.length}
            <span className="ml-auto underline">vedi tutte</span>
          </button>
          {daIncassare.slice(0, 3).map(d => (
            <button key={d.delivery_id} onClick={() => { setFiltro('incassare'); setConfirming(d); }}
              className="w-full flex items-center gap-2 px-3 py-2 border-t border-border hover:bg-accent text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{d.customer_name}</span>
                <span className="block text-xs text-muted-foreground">{nomeFattorino(d)}</span>
              </span>
              <span className="text-sm font-bold tabular-nums">{importo(d.amount)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Da incassare: elenco completo, la conferma si fa da qui */}
      {filtro === 'incassare' && (
        <div className="rounded-xl border border-border overflow-hidden" data-testid="dock-elenco-incassare">
          <div className="px-3 py-1.5 bg-secondary flex items-center gap-2">
            <Euro className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] font-semibold text-muted-foreground flex-1">DA INCASSARE</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{daIncassare.length}</p>
          </div>
          {daIncassare.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nessun incasso da confermare ✓</p>
          ) : (
            <div className="max-h-[52vh] overflow-y-auto">
              {daIncassare.map(d => (
                <button key={d.delivery_id} onClick={() => setConfirming(confirming?.delivery_id === d.delivery_id ? null : d)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-border hover:bg-accent text-left"
                  data-testid="dock-incasso-item">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{d.customer_name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{nomeFattorino(d)}</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums">{importo(d.amount)}</span>
                </button>
              ))}
            </div>
          )}
          {confirming && (
            <div className="border-t border-border p-3 flex items-center gap-2 bg-secondary/50">
              <p className="text-sm flex-1">Confermi incasso {confirming.customer_name}?</p>
              <Button size="sm" className="h-9" onClick={() => confirmPayment(confirming)} data-testid="dock-confirm-payment">
                <CheckCircle2 className="w-4 h-4 mr-1" />Conferma
              </Button>
            </div>
          )}
        </div>
      )}

      {/* In consegna: cosa e' per strada adesso e con chi */}
      {filtro === 'in_consegna' && (
        <div className="rounded-xl border border-border overflow-hidden" data-testid="dock-elenco-in-consegna">
          <div className="px-3 py-1.5 bg-secondary flex items-center gap-2">
            <Truck className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] font-semibold text-muted-foreground flex-1">IN CONSEGNA</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{inConsegna.length}</p>
          </div>
          {inConsegna.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Nessuna consegna per strada</p>
          ) : (
            <div className="max-h-[52vh] overflow-y-auto">
              {inConsegna.map(d => (
                <div key={d.delivery_id} className="flex items-start gap-2 px-3 py-2.5 border-t border-border" data-testid="dock-in-corso-item">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{d.customer_name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                      <MapPin className="w-3 h-3 shrink-0" />{d.address || d.customer_address || ''}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Truck className="w-3 h-3" />{nomeFattorino(d)}</span>
                      <span>· {ETICHETTE_STATO[d.status] || d.status}</span>
                      {d.scheduled_time && <span>· {d.scheduled_time}</span>}
                    </span>
                  </span>
                  <span className="text-sm font-bold tabular-nums shrink-0">{importo(d.amount) || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coda da smistare: si tocca una riga, si sceglie il fattorino */}
      {filtro === 'smistare' && (
        <div className="rounded-xl border border-border overflow-hidden" data-testid="dock-elenco-smistare">
          <div className="px-3 py-1.5 bg-secondary flex items-center gap-2">
            <Zap className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] font-semibold text-muted-foreground flex-1">DA SMISTARE</p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="cerca" className="h-6 pl-7 text-xs w-24" />
            </div>
          </div>
          <div className="max-h-[46vh] overflow-y-auto">
            {queueVisibile.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {queue.length === 0 ? 'Niente da smistare ✓' : 'Nessuna consegna per questa ricerca'}
              </p>
            ) : queueVisibile.map(d => {
              const sel = assigning?.delivery_id === d.delivery_id;
              return (
                <button key={d.delivery_id} onClick={() => setAssigning(sel ? null : d)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 border-t border-border text-left transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-accent'}`}
                  data-testid="dock-queue-item">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    d.priority === 'urgent' ? 'bg-red-500' : d.priority === 'high' ? 'bg-amber-400' : 'bg-blue-500'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{d.customer_name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {d.scheduled_time ? `${d.scheduled_time} · ` : ''}{d.address || d.customer_address || ''}
                    </span>
                  </span>
                  <span className="text-sm font-bold tabular-nums shrink-0">{d.amount != null ? `€${Number(d.amount).toFixed(2)}` : '—'}</span>
                </button>
              );
            })}
          </div>
          {assigning && (
            <div className="border-t border-border p-2.5 bg-secondary/50">
              <p className="text-[10px] font-semibold text-muted-foreground mb-2">ASSEGNA A:</p>
              <div className="flex flex-wrap gap-1.5">
                {activeDrivers.map(drv => (
                  <button key={drv.driver_id} onClick={() => assign(drv)}
                    className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-border text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
                    data-testid="dock-assign-driver">
                    <Truck className="w-3.5 h-3.5" />{drv.name} ({load(drv.driver_id)})
                  </button>
                ))}
                {activeDrivers.length === 0 && <p className="text-xs text-muted-foreground">Nessun fattorino attivo</p>}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground">
        Tieni il Dock aperto: mantiene il sistema sempre pronto · con Consegna veloce si apre da sé dopo ogni vendita
      </p>
    </div>
  );
}

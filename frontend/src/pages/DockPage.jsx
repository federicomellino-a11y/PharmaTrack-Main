import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeliveriesQuery, useDriversQuery } from '@/hooks/queries';
import axios from 'axios';
import { API } from '@/lib/config';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Truck, Plus, RefreshCw, Search, ClipboardCheck, Package, Euro, XCircle, CheckCircle2, Zap } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS = {
  da_preparare: 'Da preparare', pending: 'Da preparare', pronta: 'Pronta',
  assigned: 'Assegnata', picked_up: 'Ritirata', in_transit: 'In consegna',
  delivered_pending_confirmation: 'Da confermare incasso', delivered: 'Consegnata', cancelled: 'Annullata',
};

export default function DockPage() {
  const queryClient = useQueryClient();
  const { data: deliveries = [] } = useDeliveriesQuery();
  const { data: drivers = [] } = useDriversQuery();
  const [assigning, setAssigning] = useState(null); // delivery selezionata per assegnazione
  const [confirming, setConfirming] = useState(null); // delivery in conferma incasso
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

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

  // Coda da smistare: attive, senza fattorino, ordinate per priorità reale poi orario
  const queue = useMemo(() => {
    const q = deliveries
      .filter(d => ['da_preparare', 'pending', 'pronta'].includes(d.status) && !d.driver_id)
      .sort((a, b) =>
        prioRank(a) - prioRank(b) ||
        (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99') ||
        (a.created_at || '').localeCompare(b.created_at || ''));
    if (!search.trim()) return q;
    const t = search.trim().toLowerCase();
    return q.filter(d => (d.customer_name || '').toLowerCase().includes(t));
  }, [deliveries, search]);

  const activeDrivers = useMemo(() => (drivers || []).filter(d => d.is_active), [drivers]);

  const load = (driverId) => (deliveries || []).filter(
    d => d.driver_id === driverId && ['assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status)
  ).length;

  const counts = useMemo(() => {
    const ds = deliveries || [];
    return {
      toDispatch: queue.length,
      onRoad: ds.filter(d => ['picked_up', 'in_transit'].includes(d.status)).length,
      toConfirm: ds.filter(d => d.status === 'delivered_pending_confirmation').length,
    };
  }, [deliveries, queue]);

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

  const toConfirm = (deliveries || []).filter(d => d.status === 'delivered_pending_confirmation');

  return (
    <div className="min-h-screen bg-background text-foreground p-3 flex flex-col gap-3 max-w-md mx-auto">
      {/* Header: contatori */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 flex-1">
          <button onClick={() => setSearch('')} className="flex-1 rounded-xl border border-border p-2 text-center hover:bg-accent transition-colors">
            <p className="text-xl font-bold tabular-nums">{counts.toDispatch}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">DA SMISTARE</p>
          </button>
          <button className="flex-1 rounded-xl border border-border p-2 text-center opacity-90">
            <p className="text-xl font-bold tabular-nums">{counts.onRoad}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">IN CONSEGNA</p>
          </button>
          <button onClick={() => {}} className="flex-1 rounded-xl border border-border p-2 text-center hover:bg-accent transition-colors" style={{ borderColor: counts.toConfirm > 0 ? 'rgb(var(--primary))' : undefined }}>
            <p className="text-xl font-bold tabular-nums">{counts.toConfirm}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">DA INCASSARE</p>
          </button>
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

      {/* Da incassare (priorità di cassa) */}
      {toConfirm.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground bg-secondary flex items-center gap-1.5">
            <Euro className="w-3 h-3" />DA INCASSARE
          </p>
          {toConfirm.slice(0, 4).map(d => (
            <button key={d.delivery_id} onClick={() => setConfirming(confirming?.delivery_id === d.delivery_id ? null : d)}
              className="w-full flex items-center gap-2 px-3 py-2 border-t border-border hover:bg-accent text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{d.customer_name}</span>
                <span className="block text-xs text-muted-foreground">{d.driver_name || ''}</span>
              </span>
              <span className="text-sm font-bold tabular-nums">{d.amount != null ? `€${Number(d.amount).toFixed(2)}` : ''}</span>
            </button>
          ))}
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

      {/* Coda da smistare */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-3 py-1.5 bg-secondary flex items-center gap-2">
          <Zap className="w-3 h-3 text-muted-foreground" />
          <p className="text-[10px] font-semibold text-muted-foreground flex-1">DA SMISTARE</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="cerca" className="h-6 pl-7 text-xs w-24" />
          </div>
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {queue.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Niente da smistare ✓</p>
          ) : queue.map(d => {
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

      <p className="text-center text-[10px] text-muted-foreground">
        Tieni il Dock aperto: mantiene il sistema sempre pronto · alt+D con lo script Winfarm
      </p>
    </div>
  );
}

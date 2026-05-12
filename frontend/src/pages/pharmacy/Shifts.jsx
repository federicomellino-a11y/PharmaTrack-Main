import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../../components/ui/dialog';
import {
  Wallet, Truck, RefreshCw, CheckCircle2, AlertTriangle, Banknote,
  CreditCard, Clock, Filter, Euro, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';

const formatCurrency = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const formatDateTime = (d) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

const STATUS_CONFIG = {
  open:             { label: 'In corso',          className: 'bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30' },
  closed_by_driver: { label: 'Da confermare',      className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  settled:          { label: 'Confermato',        className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [detailShift, setDetailShift] = useState(null);
  const [confirmShift, setConfirmShift] = useState(null);
  const [confirmCash, setConfirmCash] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [shiftsRes, driversRes] = await Promise.all([
        axios.get(`${API}/shifts`, { withCredentials: true }),
        axios.get(`${API}/drivers`, { withCredentials: true }),
      ]);
      setShifts(ensureArray(shiftsRes.data));
      setDrivers(ensureArray(driversRes.data));
    } catch (err) {
      console.error('Errore caricamento turni:', err);
      toast.error('Errore caricamento turni');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const safeShifts = ensureArray(shifts);
  const filtered = safeShifts.filter((s) => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchDriver = driverFilter === 'all' || s.driver_id === driverFilter;
    return matchStatus && matchDriver;
  });

  const openShifts = safeShifts.filter((s) => s.status === 'open').length;
  const pendingShifts = safeShifts.filter((s) => s.status === 'closed_by_driver').length;
  const settledTodayCash = safeShifts.reduce((acc, s) => {
    if (s.status !== 'settled' || !s.settled_at) return acc;
    const settledDate = new Date(s.settled_at);
    const today = new Date();
    const sameDay = settledDate.toDateString() === today.toDateString();
    return sameDay ? acc + (s.confirmed_cash ?? s.totals?.cash_total ?? 0) : acc;
  }, 0);

  const openConfirm = async (shift) => {
    try {
      const detail = await axios.get(`${API}/shifts/${shift.shift_id}`, { withCredentials: true });
      setConfirmShift(detail.data);
      setConfirmCash((detail.data.driver_declared_cash ?? detail.data.totals?.cash_total ?? '').toString());
      setConfirmNote('');
    } catch {
      toast.error('Errore caricamento dettaglio');
    }
  };

  const submitConfirm = async () => {
    if (!confirmShift) return;
    setSubmitting(true);
    try {
      const cashNum = parseFloat(String(confirmCash).replace(',', '.'));
      await axios.post(`${API}/shifts/${confirmShift.shift_id}/settle`, {
        confirmed_cash: Number.isNaN(cashNum) ? null : cashNum,
        note: confirmNote || null,
        confirm_all_deliveries: true,
      }, { withCredentials: true });
      toast.success('Turno confermato — incassi chiusi');
      setConfirmShift(null);
      setConfirmCash('');
      setConfirmNote('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore conferma turno');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (shift) => {
    try {
      const detail = await axios.get(`${API}/shifts/${shift.shift_id}`, { withCredentials: true });
      setDetailShift(detail.data);
    } catch {
      toast.error('Errore caricamento');
    }
  };

  if (loading) return <Layout title="Turni"><div className="flex items-center justify-center h-64"><div className="spinner" /></div></Layout>;

  return (
    <Layout title="Turni & Cassa">
      <div className="space-y-4 animate-fade-in-up" data-testid="shifts-page">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />Turni & Cassa
            </h1>
            <p className="text-sm text-muted-foreground">
              {openShifts} aperti · {pendingShifts} da confermare · oggi incassati {formatCurrency(settledTodayCash)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); fetchData(); }} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />Aggiorna
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="stat-modern"><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Aperti</p>
            <p className="text-2xl font-bold text-teal-600">{openShifts}</p>
          </CardContent></Card>
          <Card className="stat-modern"><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Da confermare</p>
            <p className="text-2xl font-bold text-amber-600">{pendingShifts}</p>
          </CardContent></Card>
          <Card className="stat-modern"><CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Cassa oggi</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(settledTodayCash)}</p>
          </CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="open">In corso</SelectItem>
              <SelectItem value="closed_by_driver">Da confermare</SelectItem>
              <SelectItem value="settled">Confermati</SelectItem>
            </SelectContent>
          </Select>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-full sm:w-48 h-9">
              <Truck className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Fattorino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fattorini</SelectItem>
              {drivers.map((d) => <SelectItem key={d.driver_id} value={d.driver_id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <Wallet className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">Nessun turno trovato</p>
            <p className="text-xs text-muted-foreground mt-1">I turni appariranno qui quando un fattorino ne aprirà uno.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((s) => {
              const cfg = STATUS_CONFIG[s.status] || { label: s.status, className: 'bg-secondary' };
              const expectedCash = s.totals?.cash_total ?? 0;
              const declared = s.driver_declared_cash;
              const discrepancy = declared !== null && declared !== undefined ? declared - expectedCash : null;
              return (
                <Card key={s.shift_id} className="card-interactive">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="font-semibold text-sm">{s.driver_name || 'Fattorino'}</span>
                          <Badge className={`text-xs px-2 py-0 border ${cfg.className}`}>{cfg.label}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(s.started_at)}</span>
                          {s.ended_at && <span className="flex items-center gap-1">→ {formatDateTime(s.ended_at)}</span>}
                          <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{s.totals?.delivered_count ?? 0} consegne</span>
                          <span className="flex items-center gap-1 text-emerald-600 font-semibold"><Banknote className="w-3 h-3" />{formatCurrency(expectedCash)}</span>
                          {(s.totals?.pos_total ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-sky-600 font-semibold"><CreditCard className="w-3 h-3" />{formatCurrency(s.totals.pos_total)}</span>
                          )}
                        </div>
                        {discrepancy !== null && Math.abs(discrepancy) > 0.01 && (
                          <p className={`text-xs mt-1 font-semibold flex items-center gap-1 ${discrepancy > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            <AlertTriangle className="w-3 h-3" />
                            {discrepancy > 0 ? 'Eccesso' : 'Mancanza'}: {formatCurrency(Math.abs(discrepancy))}
                          </p>
                        )}
                        {s.status === 'settled' && s.discrepancy !== null && s.discrepancy !== undefined && Math.abs(s.discrepancy) > 0.01 && (
                          <p className={`text-xs mt-1 font-semibold flex items-center gap-1 ${s.discrepancy > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            <AlertTriangle className="w-3 h-3" />
                            {s.discrepancy > 0 ? 'Eccesso' : 'Mancanza'} chiusura: {formatCurrency(Math.abs(s.discrepancy))}
                          </p>
                        )}
                        {s.settle_note && (
                          <p className="text-xs text-muted-foreground italic mt-1">📝 {s.settle_note}</p>
                        )}
                      </div>
                      <div className="flex sm:flex-col items-end gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => openDetail(s)}>
                          <FileText className="w-3.5 h-3.5 mr-1" />Dettagli
                        </Button>
                        {s.status === 'closed_by_driver' && (
                          <Button size="sm" className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                            onClick={() => openConfirm(s)}
                            data-testid={`shift-confirm-${s.shift_id}`}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Conferma incasso
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!confirmShift} onOpenChange={(o) => { if (!o) setConfirmShift(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />Conferma incasso turno
            </DialogTitle>
            <DialogDescription>
              {confirmShift?.driver_name} · {confirmShift?.totals?.delivered_count ?? 0} consegne · attesi {formatCurrency(confirmShift?.totals?.cash_total ?? 0)} contanti
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Contanti ricevuti dal fattorino</label>
              <div className="relative">
                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={confirmCash} onChange={(e) => setConfirmCash(e.target.value)} placeholder="0.00" inputMode="decimal" className="pl-9 text-lg font-semibold" autoFocus />
              </div>
              {confirmShift?.driver_declared_cash !== null && confirmShift?.driver_declared_cash !== undefined && (
                <p className="text-xs text-muted-foreground mt-1">Il fattorino ha dichiarato {formatCurrency(confirmShift.driver_declared_cash)}</p>
              )}
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Nota (opzionale)</label>
              <Input value={confirmNote} onChange={(e) => setConfirmNote(e.target.value)} placeholder="Es: mancanza di €1, riconsegnato POS" />
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs">
              Confermando, tutte le consegne in attesa incasso di questo turno verranno chiuse.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmShift(null)}>Annulla</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submitConfirm} disabled={submitting} data-testid="shift-confirm-submit">
              {submitting ? 'Conferma…' : 'Conferma e chiudi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailShift} onOpenChange={(o) => { if (!o) setDetailShift(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />Dettaglio turno · {detailShift?.driver_name}
            </DialogTitle>
            <DialogDescription>
              {detailShift && formatDateTime(detailShift.started_at)} {detailShift?.ended_at && `→ ${formatDateTime(detailShift.ended_at)}`}
            </DialogDescription>
          </DialogHeader>
          {detailShift && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-secondary/50 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Consegne</p><p className="text-xl font-bold">{detailShift.totals?.delivered_count ?? 0}</p></div>
                <div className="rounded-lg bg-emerald-500/10 p-3"><p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Contanti</p><p className="text-xl font-bold text-emerald-600">{formatCurrency(detailShift.totals?.cash_total ?? 0)}</p></div>
                <div className="rounded-lg bg-sky-500/10 p-3"><p className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-300">POS</p><p className="text-xl font-bold text-sky-600">{formatCurrency(detailShift.totals?.pos_total ?? 0)}</p></div>
                <div className="rounded-lg bg-amber-500/10 p-3"><p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">Da incassare</p><p className="text-xl font-bold text-amber-600">{detailShift.totals?.pending_confirmation ?? 0}</p></div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Consegne del turno</h3>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {(detailShift.deliveries || []).map((d) => (
                    <div key={d.delivery_id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{d.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{d.customer_address}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(d.amount ?? 0)}</p>
                        <Badge className={`status-${d.status} text-[10px]`}>{d.status}</Badge>
                      </div>
                    </div>
                  ))}
                  {(!detailShift.deliveries || detailShift.deliveries.length === 0) && (
                    <p className="text-xs text-muted-foreground italic">Nessuna consegna nel turno</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailShift(null)}>Chiudi</Button>
            {detailShift?.status === 'closed_by_driver' && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { openConfirm(detailShift); setDetailShift(null); }}>
                <CheckCircle2 className="w-4 h-4 mr-1" />Conferma incasso
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

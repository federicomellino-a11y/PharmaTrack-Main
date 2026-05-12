import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ScrollArea } from '../../components/ui/scroll-area';
import {
  Search, Plus, Package, MapPin, Phone, User, Clock, Truck, CheckCircle2, XCircle,
  Euro, CreditCard, Banknote, Calculator, Pencil, Calendar, AlertTriangle, Filter, RefreshCw, Printer,
  ClipboardCheck, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { ensureArray } from '@/lib/collections';


const STATUS_LABELS = { da_preparare: 'Da preparare', pending: 'Da preparare', pronta: 'Pronta', assigned: 'Assegnata', picked_up: 'Ritirata', in_transit: 'In consegna', delivered_pending_confirmation: 'Da confermare incasso', delivered: 'Consegnata', cancelled: 'Annullata' };
const STATUS_ICONS = { da_preparare: Clock, pending: Clock, pronta: ClipboardCheck, assigned: User, picked_up: Package, in_transit: Truck, delivered_pending_confirmation: Euro, delivered: CheckCircle2, cancelled: XCircle };
const PRIORITY_LABELS = { low: 'Bassa', normal: 'Normale', high: 'Alta', urgent: 'Urgente' };
const PRIORITY_ICONS = { low: null, normal: null, high: AlertTriangle, urgent: AlertTriangle };

const formatCurrency = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const formatDate = (d) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

const printDeliverySlip = (delivery, drivers, user) => {
  const driver = drivers.find(dr => dr.driver_id === delivery.driver_id);
  const paymentLabel = { cash: 'Contanti', pos: 'POS', other: 'Altro' }[delivery.payment_method] || delivery.payment_method;
  const statusLabel = { pending: 'In attesa', assigned: 'Assegnata', picked_up: 'Ritirata', in_transit: 'In consegna', delivered: 'Consegnata', cancelled: 'Annullata' }[delivery.status] || delivery.status;
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Bolla Consegna</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 32px; color: #111; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #00897B; padding-bottom: 16px; margin-bottom: 20px; }
    .pharmacy-name { font-size: 20px; font-weight: 700; color: #00897B; }
    .badge { background: #00897B; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .id { font-size: 12px; color: #666; margin-top: 4px; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .row { display: flex; gap: 8px; margin-bottom: 6px; }
    .label { color: #666; min-width: 100px; font-size: 13px; }
    .value { font-weight: 600; font-size: 13px; }
    .amount-box { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 18px; }
    .amount-big { font-size: 28px; font-weight: 800; color: #16a34a; }
    .notes-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; font-style: italic; color: #4b5563; }
    .footer { margin-top: 32px; border-top: 1px dashed #ccc; padding-top: 16px; display: flex; justify-content: space-between; }
    .signature-box { border-top: 1px solid #333; width: 160px; margin-top: 40px; padding-top: 4px; font-size: 11px; color: #666; text-align: center; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <div class="header">
    <div>
      <div class="pharmacy-name">PharmaTrack</div>
      <div class="id">Consegna #${delivery.delivery_id?.slice(-8).toUpperCase()}</div>
      ${user?.pharmacy_name ? `<div style="font-size:13px;color:#444;margin-top:2px;">${user.pharmacy_name}</div>` : ''}
    </div>
    <div style="text-align:right">
      <span class="badge">${statusLabel}</span>
      <div style="font-size:12px;color:#666;margin-top:6px;">${new Date(delivery.created_at).toLocaleString('it-IT')}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Cliente</div>
    <div class="row"><span class="label">Nome</span><span class="value">${delivery.customer_name || '-'}</span></div>
    <div class="row"><span class="label">Telefono</span><span class="value">${delivery.customer_phone || '-'}</span></div>
    <div class="row"><span class="label">Indirizzo</span><span class="value">${delivery.customer_address || '-'}</span></div>
  </div>
  ${driver ? `<div class="section"><div class="section-title">Fattorino</div>
    <div class="row"><span class="label">Nome</span><span class="value">${driver.name}</span></div>
    <div class="row"><span class="label">Telefono</span><span class="value">${driver.phone || '-'}</span></div>
    <div class="row"><span class="label">Veicolo</span><span class="value">${driver.vehicle_type || '-'}</span></div>
  </div>` : ''}
  ${delivery.amount ? `<div class="amount-box">
    <div style="font-size:12px;color:#16a34a;font-weight:600;margin-bottom:4px;">IMPORTO DA RISCUOTERE</div>
    <div class="amount-big">${formatCurrency(delivery.amount)}</div>
    <div style="font-size:13px;color:#666;margin-top:4px;">Pagamento: ${paymentLabel}${delivery.amount_given ? ` · Consegnati: ${formatCurrency(delivery.amount_given)} · Resto: ${formatCurrency(delivery.amount_given - delivery.amount)}` : ''}</div>
  </div>` : ''}
  ${delivery.notes ? `<div class="section"><div class="section-title">Note / Farmaci</div><div class="notes-box">${delivery.notes}</div></div>` : ''}
  <div class="footer">
    <div><div class="signature-box">Firma cliente</div></div>
    <div style="font-size:11px;color:#aaa;">Stampato il ${new Date().toLocaleString('it-IT')}</div>
  </div>
  </body></html>`;
  const win = window.open('', '_blank', 'width=700,height=900');
  if (!win) {
    toast.error('Abilita i popup per stampare la bolla');
    return;
  }
  // DOM-safe replacement of document.write (XSS-safe: html is built from
  // template literals with our own data, not user input from external sources;
  // we still avoid document.write per CSP / browser best practices).
  win.document.open();
  win.document.documentElement.innerHTML = html.replace(/^<!DOCTYPE html>/i, '').replace(/<\/?html[^>]*>/gi, '');
  win.document.close();
  win.onload = () => { win.print(); };
};

export default function DeliveriesPage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerInputRef = React.useRef(null);
  const [activeTab, setActiveTab] = useState('active');
  const [filterDriver, setFilterDriver] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [prontaDialogOpen, setProntaDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [form, setForm] = useState({
    customer_id: 'none', notes: '', payment_method: 'cash',
    amount: '', amount_given: '', scheduled_date: '', scheduled_time: '', priority: 'normal'
  });

  // Stato per import Winfarm: dati pre-compilati dalla querystring
  const [winfarmPrefill, setWinfarmPrefill] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [dRes, cRes, drRes] = await Promise.all([
        axios.get(`${API}/deliveries`, { withCredentials: true }),
        axios.get(`${API}/customers`, { withCredentials: true }),
        axios.get(`${API}/drivers`, { withCredentials: true }),
      ]);
      setDeliveries(ensureArray(dRes.data));
      setCustomers(ensureArray(cRes.data));
      setDrivers(ensureArray(drRes.data));
    } catch (err) {
      console.error('Errore caricamento dati:', err);
      toast.error('Errore nel caricamento');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Open new delivery if ?new=true or ?new=1, supporta deep-link da Winfarm
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const newParam = params.get('new');
    if (newParam === 'true' || newParam === '1') {
      // Estrai eventuali parametri di pre-compilazione (Winfarm bridge)
      const prefill = {
        customer_name: params.get('customer_name') || params.get('cliente') || '',
        customer_phone: params.get('customer_phone') || params.get('telefono') || '',
        customer_address: params.get('customer_address') || params.get('indirizzo') || '',
        amount: params.get('amount') || params.get('importo') || '',
        payment_method: params.get('payment_method') || params.get('pagamento') || 'cash',
        notes: params.get('notes') || params.get('note') || '',
      };
      const hasPrefill = !!(prefill.customer_name || prefill.customer_phone || prefill.amount);
      if (hasPrefill) setWinfarmPrefill(prefill);
      setDialogOpen(true);
      window.history.replaceState({}, '', '/deliveries');
    }
    fetchData();
  }, [fetchData]);

  // Applica i dati pre-compilati di Winfarm quando i clienti sono pronti
  useEffect(() => {
    if (!winfarmPrefill || !customers.length) return;
    const safeCustomers = ensureArray(customers);
    const phoneNorm = (s) => (s || '').replace(/\D/g, '');
    let matched = null;
    if (winfarmPrefill.customer_phone) {
      const target = phoneNorm(winfarmPrefill.customer_phone);
      matched = safeCustomers.find(c => phoneNorm(c.phone) === target);
    }
    if (!matched && winfarmPrefill.customer_name) {
      const target = winfarmPrefill.customer_name.trim().toLowerCase();
      matched = safeCustomers.find(c => (c.name || '').trim().toLowerCase() === target);
    }
    setForm((prev) => ({
      ...prev,
      customer_id: matched ? matched.customer_id : prev.customer_id,
      amount: winfarmPrefill.amount || prev.amount,
      payment_method: winfarmPrefill.payment_method || prev.payment_method,
      notes: winfarmPrefill.notes || prev.notes,
    }));
    if (!matched && winfarmPrefill.customer_name) {
      // mostra termine di ricerca così il farmacista vede la lista filtrata
      setCustomerSearchTerm(winfarmPrefill.customer_name);
      setCustomerDropdownOpen(true);
      toast.info(`Cliente "${winfarmPrefill.customer_name}" non trovato — selezionalo o crealo`);
    } else if (matched) {
      toast.success(`Pre-compilato da Winfarm: ${matched.name}`);
    }
    setWinfarmPrefill(null);
  }, [winfarmPrefill, customers]);

  const resetForm = () => {
    setForm({ customer_id: 'none', notes: '', payment_method: 'cash', amount: '', amount_given: '', scheduled_date: '', scheduled_time: '', priority: 'normal' });
    setCustomerSearchTerm('');
    setCustomerDropdownOpen(false);
  };

  const normalizeMoney = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const validateCashForm = () => {
    const amount = normalizeMoney(form.amount);
    const amountGiven = normalizeMoney(form.amount_given);
    if (form.payment_method === 'cash' && amount !== null && amountGiven !== null && amountGiven < amount) {
      toast.error('Il pagato con deve essere uguale o superiore all’importo');
      return false;
    }
    return true;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (form.customer_id === 'none') { toast.error('Seleziona un cliente'); return; }
    if (!validateCashForm()) return;
    try {
      const defaultDriverId = user?.settings?.default_driver_id;
      const defaultDriver = ensureArray(drivers).find((driver) => driver.driver_id === defaultDriverId && driver.is_active);
      await axios.post(`${API}/deliveries`, {
        ...form,
        customer_id: form.customer_id,
        driver_id: defaultDriver?.driver_id || null,
        amount: normalizeMoney(form.amount),
        amount_given: normalizeMoney(form.amount_given)
      }, { withCredentials: true });

      toast.success(defaultDriver ? `Consegna creata e assegnata a ${defaultDriver.name}` : 'Consegna creata');
      setDialogOpen(false); resetForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Errore'); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!validateCashForm()) return;
    try {
      await axios.put(`${API}/deliveries/${selectedDelivery.delivery_id}`, {
        notes: form.notes,
        payment_method: form.payment_method,
        amount: normalizeMoney(form.amount),
        amount_given: normalizeMoney(form.amount_given),
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null
      }, { withCredentials: true });
      toast.success('Aggiornata');
      setEditDialogOpen(false); resetForm(); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Errore modifica'); }
  };

  const handleAssign = async (driverId) => {
    try {
      await axios.put(`${API}/deliveries/${selectedDelivery.delivery_id}`,
        { driver_id: driverId || null }, { withCredentials: true });
      toast.success(driverId ? 'Fattorino assegnato' : 'Fattorino rimosso');
      setAssignDialogOpen(false); setSelectedDelivery(null); fetchData();
    } catch { toast.error('Errore assegnazione'); }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Annullare questa consegna?')) return;
    try {
      await axios.put(`${API}/deliveries/${id}`, { status: 'cancelled' }, { withCredentials: true });
      toast.success('Consegna annullata'); fetchData();
    } catch { toast.error('Errore'); }
  };

  const handleMarkDelivered = async (id) => {
    try {
      await axios.put(`${API}/deliveries/${id}`, { status: 'delivered' }, { withCredentials: true });
      toast.success('✓ Consegnata!'); fetchData();
    } catch { toast.error('Errore'); }
  };

  const handleConfirmPayment = async (delivery) => {
    const note = window.prompt(`Confermi l'incasso di ${formatCurrency(delivery.amount)} da ${delivery.customer_name}?\n\nLascia una nota se vuoi (opzionale).`, '');
    if (note === null) return; // user cancelled
    try {
      await axios.post(`${API}/deliveries/${delivery.delivery_id}/confirm-payment`,
        { confirmed_amount: delivery.amount, note: note || null },
        { withCredentials: true });
      toast.success('✓ Incasso confermato'); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Errore conferma'); }
  };

  const handleDisputePayment = async (delivery) => {
    const reason = window.prompt(`Segnala un problema con l'incasso di ${delivery.customer_name}.\n\nMotivo (es: importo errato, manca parte del contante):`, '');
    if (!reason || !reason.trim()) return;
    try {
      await axios.post(`${API}/deliveries/${delivery.delivery_id}/dispute-payment`,
        { reason: reason.trim() },
        { withCredentials: true });
      toast.success('Contestazione registrata'); fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Errore'); }
  };

  const handleMarkPronta = async (e) => {
    e.preventDefault();
    if (!validateCashForm()) return;
    try {
      await axios.put(`${API}/deliveries/${selectedDelivery.delivery_id}`, {
        status: 'pronta',
        payment_method: form.payment_method,
        amount: normalizeMoney(form.amount),
        amount_given: normalizeMoney(form.amount_given),
      }, { withCredentials: true });
      toast.success('Consegna segnata come pronta');
      setProntaDialogOpen(false);
      setSelectedDelivery(null);
      resetForm();
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Errore'); }
  };

  const handleAdvanceStatus = async (delivery) => {
    const next = {
      assigned: 'in_transit',
      picked_up: 'in_transit',
      in_transit: 'delivered',
    };
    const nextStatus = next[delivery.status];
    if (!nextStatus) return;
    if (delivery.status === 'assigned' && !delivery.driver_id) {
      toast.error('Assegna prima un fattorino per avviare la consegna');
      setSelectedDelivery(delivery);
      setAssignDialogOpen(true);
      return;
    }
    const label = nextStatus === 'in_transit' ? 'In consegna' : 'Consegnata';
    try {
      await axios.put(`${API}/deliveries/${delivery.delivery_id}`,
        { status: nextStatus }, { withCredentials: true });
      toast.success(`✓ ${label}`);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Errore aggiornamento stato'); }
  };


  // Filter deliveries (memoizzato per evitare ricalcolo ad ogni render)
  const safeDeliveries = useMemo(() => ensureArray(deliveries), [deliveries]);
  const safeCustomers = useMemo(() => ensureArray(customers), [customers]);
  const safeDrivers = useMemo(() => ensureArray(drivers), [drivers]);

  const filtered = useMemo(() => safeDeliveries.filter(d => {
    const matchTab = activeTab === 'active'
      ? ['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status)
      : activeTab === 'pending_confirmation'
        ? d.status === 'delivered_pending_confirmation'
        : ['delivered', 'cancelled'].includes(d.status);
    const matchSearch = !searchTerm ||
      (d.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.customer_address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchDriver = filterDriver === 'all' || d.driver_id === filterDriver ||
      (filterDriver === 'unassigned' && !d.driver_id);
    return matchTab && matchSearch && matchDriver;
  }), [safeDeliveries, activeTab, searchTerm, filterDriver]);

  const { activeCount, pendingCount, pendingConfirmCount } = useMemo(() => ({
    activeCount: safeDeliveries.filter(d => ['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status)).length,
    pendingCount: safeDeliveries.filter(d => ['da_preparare', 'pronta', 'pending'].includes(d.status)).length,
    pendingConfirmCount: safeDeliveries.filter(d => d.status === 'delivered_pending_confirmation').length,
  }), [safeDeliveries]);

  const dialogCustomers = safeCustomers.filter((customer) => {
    const term = customerSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return [customer.name, customer.address, customer.phone]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term));
  });
  const selectedCustomer = safeCustomers.find(c => c.customer_id === form.customer_id) || null;

  const amountValue = normalizeMoney(form.amount);
  const amountGivenValue = normalizeMoney(form.amount_given);
  const change_due = amountValue !== null && amountGivenValue !== null
    ? amountGivenValue - amountValue : null;

  if (loading) return <Layout title="Consegne"><div className="flex items-center justify-center h-64"><div className="spinner" /></div></Layout>;

  return (
    <Layout title="Consegne">
      <div className="space-y-4 animate-fade-in-up" data-testid="deliveries-page">

        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Consegne</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} attive · {pendingCount} in attesa
              {pendingConfirmCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-xs">
                  <Euro className="w-3 h-3" />{pendingConfirmCount} da confermare incasso
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); fetchData(); }} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button className="btn-primary" size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" />Nuova Consegna
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cerca cliente, indirizzo, note..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={filterDriver} onValueChange={setFilterDriver}>
            <SelectTrigger className="w-full sm:w-44 h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Fattorino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fattorini</SelectItem>
              <SelectItem value="unassigned">Non assegnate</SelectItem>
              {safeDrivers.filter(d => d.is_active).map(d => (
                <SelectItem key={d.driver_id} value={d.driver_id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="h-9">
              <TabsTrigger value="active" className="text-xs px-3">Attive {activeCount > 0 && <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-primary/15 text-primary font-bold">{activeCount}</span>}</TabsTrigger>
              <TabsTrigger value="pending_confirmation" className="text-xs px-3">
                <Euro className="w-3 h-3 mr-1" />Da incassare
                {pendingConfirmCount > 0 && <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">{pendingConfirmCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-3">Completate</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Deliveries list */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">
                {searchTerm ? 'Nessuna consegna trovata' : activeTab === 'active' ? 'Nessuna consegna attiva' : 'Archivio vuoto'}
              </p>
              {!searchTerm && activeTab === 'active' && (
                <Button className="btn-primary mt-4" size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1.5" />Crea la prima consegna
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(d => {
              const StatusIcon = STATUS_ICONS[d.status] || Package;
              const driver = safeDrivers.find(dr => dr.driver_id === d.driver_id);
              const PriorityIcon = d.priority && PRIORITY_ICONS[d.priority];
              return (
                <Card key={d.delivery_id} className={`
                  transition-all hover:shadow-md
                  ${d.priority === 'urgent' ? 'border-l-4 border-l-destructive' : ''}
                  ${d.priority === 'high' ? 'border-l-4 border-l-amber-400' : ''}
                `}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Status icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                        ${d.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-600' :
                          d.status === 'delivered_pending_confirmation' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30 animate-pulse-soft' :
                          d.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                          d.status === 'in_transit' ? 'bg-primary/10 text-primary' :
                          d.status === 'pronta' ? 'bg-green-500/10 text-green-600' :
                          'bg-secondary text-muted-foreground'}`}>
                        <StatusIcon className="w-5 h-5" />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="font-semibold text-sm">{d.customer_name}</span>
                          <Badge className={`status-${d.status} text-xs px-2 py-0`}>
                            {STATUS_LABELS[d.status]}
                          </Badge>
                          {d.priority && d.priority !== 'normal' && (
                            <Badge className={`priority-${d.priority} px-2 py-0`}>
                              {PriorityIcon && <PriorityIcon className="w-3 h-3 mr-1 inline" />}
                              {PRIORITY_LABELS[d.priority]}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{d.customer_address}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{d.customer_phone}
                          </span>
                          {driver && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" />{driver.name}
                            </span>
                          )}
                          {d.scheduled_date && (
                            <span className="flex items-center gap-1 text-primary">
                              <Calendar className="w-3 h-3" />
                              {d.scheduled_date} {d.scheduled_time}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />{formatDate(d.created_at)}
                          </span>
                        </div>
                        {d.notes && (
                          <p className="text-xs text-muted-foreground mt-1.5 bg-secondary/40 rounded-lg px-2.5 py-1.5 italic">
                            📝 {d.notes}
                          </p>
                        )}
                      </div>

                      {/* Amount + actions */}
                      <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 shrink-0">
                        {d.amount && (
                          <div className="text-right">
                            <p className="font-bold text-base text-primary">{formatCurrency(d.amount)}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              {d.payment_method === 'cash'
                                ? <><Banknote className="w-3 h-3" />Contanti</>
                                : <><CreditCard className="w-3 h-3" />POS</>}
                            </p>
                          </div>
                        )}
                        {['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status) && (
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            {d.status === 'delivered_pending_confirmation' && (
                              <>
                                <Button size="sm" className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md"
                                  onClick={() => handleConfirmPayment(d)}
                                  data-testid={`confirm-payment-${d.delivery_id}`}>
                                  <Euro className="w-3.5 h-3.5 mr-1" />Conferma incasso
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 px-2 text-xs text-amber-700 border-amber-500/40 hover:bg-amber-500/10"
                                  onClick={() => handleDisputePayment(d)}
                                  title="Contesta">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => printDeliverySlip(d, safeDrivers, user)}
                              title="Stampa bolla">
                              <Printer className="w-3 h-3" />
                            </Button>
                            {d.status !== 'delivered_pending_confirmation' && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setSelectedDelivery(d);
                                  setForm({ ...form, notes: d.notes || '', payment_method: d.payment_method || 'cash', amount: d.amount || '', amount_given: d.amount_given || '', scheduled_date: d.scheduled_date || '', scheduled_time: d.scheduled_time || '' });
                                  setEditDialogOpen(true);
                                }}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            {['da_preparare', 'pending'].includes(d.status) && (
                              <Button size="sm" className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                                onClick={() => {
                                  setSelectedDelivery(d);
                                  setForm({ ...form, payment_method: d.payment_method || 'cash', amount: d.amount || '', amount_given: d.amount_given || '' });
                                  setProntaDialogOpen(true);
                                }}>
                                <ClipboardCheck className="w-3 h-3 mr-1" />Pronta
                              </Button>
                            )}
                            {['pronta', 'assigned', 'picked_up'].includes(d.status) && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                                onClick={() => { setSelectedDelivery(d); setAssignDialogOpen(true); }}>
                                <Truck className="w-3 h-3" />
                              </Button>
                            )}
                            {['assigned', 'picked_up'].includes(d.status) && (
                              <Button size="sm" className="h-7 px-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                                onClick={() => handleAdvanceStatus(d)}>
                                <ChevronRight className="w-3 h-3 mr-1" />Avvia
                              </Button>
                            )}
                            {d.status === 'in_transit' && (
                              <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => handleAdvanceStatus(d)}>
                                <CheckCircle2 className="w-3 h-3 mr-1" />Consegnata
                              </Button>
                            )}
                            {d.status !== 'delivered_pending_confirmation' && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleCancel(d.delivery_id)}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
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

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />Nuova Consegna
            </DialogTitle>
            <DialogDescription>
              Fase 1 — Seleziona cliente e aggiungi note. Il pagamento si aggiunge quando la consegna è pronta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="form-group space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente *</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-primary px-2"
                  onClick={() => window.location.href = '/customers?new=true'}>
                  <Plus className="w-3 h-3 mr-1" />Nuovo cliente
                </Button>
              </div>
              {selectedCustomer ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedCustomer.phone && <span>{selectedCustomer.phone} · </span>}
                      {selectedCustomer.address}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                    onClick={() => { setForm({...form, customer_id: 'none'}); setCustomerSearchTerm(''); setTimeout(() => customerInputRef.current?.focus(), 50); }}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                  <Input
                    ref={customerInputRef}
                    placeholder="Cerca per nome, telefono o indirizzo..."
                    value={customerSearchTerm}
                    onChange={(e) => { setCustomerSearchTerm(e.target.value); setCustomerDropdownOpen(true); }}
                    onFocus={() => setCustomerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 150)}
                    className="pl-9"
                    autoComplete="off"
                  />
                  {customerDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                      <div className="max-h-52 overflow-y-auto">
                        {dialogCustomers.length === 0 ? (
                          <div className="p-4 text-center">
                            <p className="text-sm text-muted-foreground mb-2">Nessun cliente trovato</p>
                            <Button type="button" variant="outline" size="sm" onMouseDown={() => window.location.href = '/customers?new=true'}>
                              <Plus className="w-3.5 h-3.5 mr-1" />Aggiungi cliente
                            </Button>
                          </div>
                        ) : (
                          <>
                            {dialogCustomers.slice(0, 8).map(c => (
                              <button type="button" key={c.customer_id}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                                onMouseDown={() => {
                                  setForm({...form, customer_id: c.customer_id});
                                  setCustomerSearchTerm('');
                                  setCustomerDropdownOpen(false);
                                }}>
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <User className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{c.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {c.phone ? `${c.phone} · ` : ''}{c.address}
                                  </p>
                                </div>
                              </button>
                            ))}
                            {dialogCustomers.length > 8 && (
                              <div className="px-4 py-2 text-xs text-muted-foreground text-center bg-muted/30">
                                +{dialogCustomers.length - 8} altri risultati · scrivi per affinare
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <Label>Priorità</Label>
              <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🟢 Bassa</SelectItem>
                  <SelectItem value="normal">🔵 Normale</SelectItem>
                  <SelectItem value="high">🟡 Alta</SelectItem>
                  <SelectItem value="urgent">🔴 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>



            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Data programmata</Label>
                <Input type="date" value={form.scheduled_date}
                  onChange={e => setForm({...form, scheduled_date: e.target.value})} />
              </div>
              <div className="form-group">
                <Label>Orario</Label>
                <Input type="time" value={form.scheduled_time}
                  onChange={e => setForm({...form, scheduled_time: e.target.value})} />
              </div>
            </div>

            <div className="form-group">
              <Label>Note / Farmaci</Label>
              <Textarea placeholder="Es: Augmentin 1g, Tachipirina 1000..." value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})} className="min-h-[80px]" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Annulla
              </Button>
              <Button type="submit" className="btn-primary">
                <Package className="w-4 h-4 mr-1.5" />Crea Consegna
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Segna Pronta dialog — Fase 2: aggiunge pagamento */}
      <Dialog open={prontaDialogOpen} onOpenChange={(o) => { if (!o) { setSelectedDelivery(null); resetForm(); } setProntaDialogOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-500" />Segna come Pronta
            </DialogTitle>
            <DialogDescription>
              Fase 2 — Aggiungi il metodo di pagamento per marcare la consegna come pronta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMarkPronta} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Pagamento</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Contanti</SelectItem>
                    <SelectItem value="pos">💳 POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="form-group">
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
            </div>
            {form.payment_method === 'cash' && (
              <div className="form-group">
                <Label>Pagato con (€)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.amount_given} onChange={e => setForm({...form, amount_given: e.target.value})} />
              </div>
            )}
            {form.payment_method === 'cash' && change_due !== null && (
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${change_due >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-destructive/10 border-destructive/20'}`}>
                <Calculator className={`w-4 h-4 ${change_due >= 0 ? 'text-emerald-600' : 'text-destructive'}`} />
                <span className={`text-sm font-semibold ${change_due >= 0 ? 'text-emerald-700' : 'text-destructive'}`}>
                  {change_due >= 0 ? `Resto: ${formatCurrency(change_due)}` : "Il pagato con non copre l'importo"}
                </span>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setProntaDialogOpen(false); setSelectedDelivery(null); resetForm(); }}>
                Annulla
              </Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white">
                <ClipboardCheck className="w-4 h-4 mr-1.5" />Segna come Pronta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Consegna</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Pagamento</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Contanti</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="form-group">
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
            </div>
            {form.payment_method === 'cash' && (
              <div className="form-group">
                <Label>Pagato con (€)</Label>
                <Input type="number" step="0.01" min="0" value={form.amount_given}
                  onChange={e => setForm({...form, amount_given: e.target.value})} />
              </div>
            )}
            {form.payment_method === 'cash' && change_due !== null && (
              <p className={`text-xs ${change_due >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {change_due >= 0 ? `Resto calcolato: ${formatCurrency(change_due)}` : 'Il pagato con deve coprire l’importo totale'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Data</Label>
                <Input type="date" value={form.scheduled_date}
                  onChange={e => setForm({...form, scheduled_date: e.target.value})} />
              </div>
              <div className="form-group">
                <Label>Orario</Label>
                <Input type="time" value={form.scheduled_time}
                  onChange={e => setForm({...form, scheduled_time: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <Label>Note</Label>
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="min-h-[80px]" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Annulla</Button>
              <Button type="submit" className="btn-primary">Salva</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assegna Fattorino</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Button variant="outline" className="w-full justify-start text-muted-foreground h-11"
              onClick={() => handleAssign(null)}>
              <XCircle className="w-4 h-4 mr-2" />Rimuovi fattorino
            </Button>
            {safeDrivers.filter(d => d.is_active).map(d => (
              <Button key={d.driver_id} variant={selectedDelivery?.driver_id === d.driver_id ? 'default' : 'outline'}
                className={`w-full justify-start h-11 ${selectedDelivery?.driver_id === d.driver_id ? 'btn-primary' : ''}`}
                onClick={() => handleAssign(d.driver_id)}>
                <Truck className="w-4 h-4 mr-2" />
                <span className="font-medium">{d.name}</span>
                <span className="ml-auto text-xs opacity-70">{d.vehicle_type}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeliveriesQuery, useCustomersQuery, useDriversQuery } from '@/hooks/queries';
import { ListSkeleton } from '../../components/Skeletons';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import axios from 'axios';
import { API } from '@/lib/config';
import { FASCE, fasciaDi, testoFascia } from '@/lib/fasce';
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
  Euro, CreditCard, Banknote, Calculator, Pencil, Calendar, AlertTriangle, Filter, RefreshCw, Printer, History, RotateCcw, Share2,
  ClipboardCheck, ChevronRight, Download
} from 'lucide-react';
import { toast } from 'sonner';

// Il limite del piano arriva come 402: va spiegato, non mostrato come guasto.
import printDeliverySlip from '@/lib/printDeliverySlip';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { STATUS_LABELS, STATUS_ICONS, PRIORITY_LABELS, PRIORITY_ICONS } from '@/lib/deliveryDisplay';
const messaggioPiano = (errore, ripiego) =>
  errore?.response?.status === 402
    ? (errore.response.data?.detail || 'Limite del piano raggiunto.')
    : ripiego;
import { useAuth } from '../../contexts/AuthContext';
import { ensureArray } from '@/lib/collections';
import { printDeliveryLabel } from '@/lib/printLabel';
import useDeliveryForm, { normalizzaImporto } from '@/hooks/useDeliveryForm';
import DeliveryRow from '../../components/deliveries/DeliveryRow';
import CreaConsegnaDialog from '../../components/deliveries/CreaConsegnaDialog';
import SegnaProntaDialog from '../../components/deliveries/SegnaProntaDialog';
import { avanzamentoFarmacia } from '@/lib/deliveryActions';
import { costruisciCorrezioneStato } from '@/lib/deliveryCorrection';
import ModificaConsegnaDialog from '../../components/deliveries/ModificaConsegnaDialog';
import AssegnaConsegnaDialog from '../../components/deliveries/AssegnaConsegnaDialog';
import NuovoClienteDialog from '../../components/deliveries/NuovoClienteDialog';
import { confirmAction } from '../../components/ConfirmDialog';




export default function DeliveriesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: deliveries = [], isLoading: loading } = useDeliveriesQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: drivers = [] } = useDriversQuery();
  const setCustomers = (updater) =>
    queryClient.setQueryData(['customers'], (prev) =>
      typeof updater === 'function' ? updater(ensureArray(prev)) : updater);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [activeCustomerIndex, setActiveCustomerIndex] = useState(-1);
  const customerInputRef = React.useRef(null);
  const [activeTab, setActiveTab] = useState('active');
  const [repairing, setRepairing] = useState(false);
  const [filterDriver, setFilterDriver] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [prontaDialogOpen, setProntaDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  // La fascia scelta è uno stato suo: derivarla dai valori non permetteva
  // di passare a "Orario preciso" quando i valori coincidevano con una fascia.
  // Una consegna e' "in ritardo" quando e' ancora da fare e la fascia promessa
  // e' passata: stessa regola del Report e dell'elenco del fattorino.
  const inRitardo = (consegna) => {
    if (!consegna?.scheduled_time) return false;
    if (!['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit'].includes(consegna.status)) return false;
    const fine = (consegna.slot_to || consegna.scheduled_time).slice(0, 5);
    const giorno = consegna.scheduled_date || (consegna.created_at ? consegna.created_at.slice(0, 10) : null);
    if (giorno) {
      const oggi = new Date().toLocaleDateString('sv-SE');
      if (giorno < oggi) return true;
      if (giorno > oggi) return false;
    }
    const adesso = new Date();
    const minuti = adesso.getHours() * 60 + adesso.getMinutes();
    const [ore, min] = fine.split(':').map(Number);
    return Number.isFinite(ore) && minuti > ore * 60 + min;
  };

  // Stato del modulo consegna: vive in hooks/useDeliveryForm.js
  const modulo = useDeliveryForm();
  const { form, setForm, fasciaScelta, setFasciaScelta, change_due, amountValue, amountGivenValue } = modulo;

  // Stato per import Winfarm: dati pre-compilati dalla querystring
  const [winfarmPrefill, setWinfarmPrefill] = useState(null);

  // Dialog "Crea cliente al volo" dentro Nuova Consegna
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', extraPhones: [], address: '', notes: '' });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const openCreateCustomer = (prefilledName) => {
    setNewCustomer({ name: prefilledName || '', phone: '', extraPhones: [], address: '', notes: '' });
    setCreateCustomerOpen(true);
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) { toast.error('Il nome è obbligatorio'); return; }
    // Un cliente senza indirizzo non puo' ricevere consegne: si crea completo.
    if (!(newCustomer.address || '').trim()) {
      toast.error("Serve l'indirizzo: senza, la consegna non si puo' fare");
      return;
    }
    setCreatingCustomer(true);
    try {
      const res = await axios.post(`${API}/customers`, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        customer_lat: newCustomer.lat || null,
        customer_lng: newCustomer.lng || null,
        place_id: newCustomer.placeId || null,
        extra_phones: (newCustomer.extraPhones || []).map(p => (p || '').trim()).filter(Boolean),
        notes: newCustomer.notes.trim() || null,
      }, { withCredentials: true });
      const created = res.data;
      toast.success(`Cliente "${created.name}" creato`);
      // Aggiorna lista clienti localmente per evitare un fetch + auto-seleziona
      setCustomers((prev) => [created, ...ensureArray(prev)]);
      setForm((prev) => ({ ...prev, customer_id: created.customer_id }));
      setCustomerSearchTerm('');
      setCustomerDropdownOpen(false);
      setCreateCustomerOpen(false);
      setNewCustomer({ name: '', phone: '', extraPhones: [], address: '', notes: '' });
    } catch (err) {
      console.error('Errore creazione cliente:', err);
      toast.error(err.response?.data?.detail || 'Errore creazione cliente');
    } finally {
      setCreatingCustomer(false);
    }
  };

  // Ogni azione su una consegna muove anche altro: i KPI della home, l'archivio,
  // i turni (incassi) e i clienti. Invalidando solo ['deliveries'] restavano
  // numeri vecchi finche' non si ricaricava la pagina.
  const fetchData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
      queryClient.invalidateQueries({ queryKey: ['drivers'] }),
      queryClient.invalidateQueries({ queryKey: ['statistics'] }),
      queryClient.invalidateQueries({ queryKey: ['archive'] }),
      queryClient.invalidateQueries({ queryKey: ['shifts'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

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
        priority: params.get('priority') || params.get('priorita') || null,
        scheduled_time: params.get('time') || params.get('orario') || null,
      };
      const hasPrefill = !!(prefill.customer_name || prefill.customer_phone || prefill.amount);
      if (hasPrefill) setWinfarmPrefill(prefill);
      setDialogOpen(true);
      window.history.replaceState({}, '', '/deliveries');
    }
  }, []);

  // Apertura da un altro punto dell'app mentre sei gia' su questa pagina
  useEffect(() => {
    const open = () => setDialogOpen(true);
    window.addEventListener('pt:new-delivery', open);
    return () => window.removeEventListener('pt:new-delivery', open);
  }, []);

  // Autofocus sul campo cliente quando si apre "Nuova consegna" (meno click al banco)
  useEffect(() => {
    if (!dialogOpen) return;
    const t = setTimeout(() => customerInputRef.current?.focus?.(), 120);
    return () => clearTimeout(t);
  }, [dialogOpen]);

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
      priority: ['low', 'normal', 'high', 'urgent'].includes(winfarmPrefill.priority) ? winfarmPrefill.priority : prev.priority,
      scheduled_time: winfarmPrefill.scheduled_time || prev.scheduled_time,
      slot_to: winfarmPrefill.scheduled_time ? (prev.slot_to ?? null) : prev.slot_to,
    }));
    if (winfarmPrefill.scheduled_time) {
      setFasciaScelta((fasciaDi(winfarmPrefill.scheduled_time, null) || { valore: 'subito' }).valore);
    }
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
    modulo.reset();
    setCustomerSearchTerm('');
    setCustomerDropdownOpen(false);
  };

  const normalizeMoney = (value) => normalizzaImporto(value);

  const validateCashForm = () => {
    const amount = normalizeMoney(form.amount);
    const amountGiven = normalizeMoney(form.amount_given);
    if (form.payment_method === 'cash' && amount !== null && amountGiven !== null && amountGiven < amount) {
      toast.error('Il pagato con deve essere uguale o superiore all’importo');
      return false;
    }
    return true;
  };

  const dialogOpenedAtRef = React.useRef(null);

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
        amount_given: normalizeMoney(form.amount_given),
        nre: form.nre ? String(form.nre).trim() : null,
        client_meta: {
          duration_ms: dialogOpenedAtRef.current ? (Date.now() - dialogOpenedAtRef.current) : null,
          source: new URLSearchParams(window.location.search).get('new') ? 'prefill' : 'dialog',
        }
      }, { withCredentials: true });

      toast.success(defaultDriver ? `Consegna creata e assegnata a ${defaultDriver.name}` : 'Consegna creata');
      setDialogOpen(false); resetForm(); fetchData();
    } catch (err) { toast.error(messaggioPiano(err, err.response?.data?.detail || 'Errore')); }
  };

  // La fascia scelta si ricava dallo stato: così resta coerente anche quando
  // l'orario arriva dal pulsante magico o dal Dock.

  const applicaFascia = (valore) => {
    setFasciaScelta(valore);
    const scelta = FASCE.find((f) => f.valore === valore);
    if (!scelta || valore === 'preciso') {
      // "Orario preciso": si tengono i valori attuali e si mostrano i campi.
      setForm((precedente) => ({ ...precedente, scheduled_time: precedente.scheduled_time || '', slot_to: precedente.slot_to || null }));
      return;
    }
    setForm((precedente) => ({ ...precedente, scheduled_time: scelta.da || '', slot_to: scelta.a }));
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
        scheduled_time: form.scheduled_time || null,
        slot_to: form.slot_to || null,
        ...costruisciCorrezioneStato(selectedDelivery, form.status, form.force_reason),
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
    if (!(await confirmAction({ title: 'Annullare questa consegna?', description: "Potrai ripristinarla dalla sezione archivio.", confirmLabel: 'Annulla consegna', destructive: true }))) return;
    try {
      await axios.put(`${API}/deliveries/${id}`, { status: 'cancelled' }, { withCredentials: true });
      toast.success('Consegna annullata'); fetchData();
    } catch { toast.error('Errore'); }
  };

  const handleRestore = async (id) => {
    try {
      await axios.post(`${API}/deliveries/${id}/restore`, {}, { withCredentials: true });
      toast.success('Consegna ripristinata'); fetchData();
    } catch (error) { toast.error(error?.response?.data?.detail || 'Ripristino non riuscito'); }
  };

  const repairCoordinates = async () => {
    setRepairing(true);
    try {
      const { data } = await axios.post(`${API}/deliveries/repair-coordinates`, {}, { withCredentials: true });
      if (!data?.checked) {
        toast.info('Tutti gli indirizzi hanno già coordinate precise');
      } else {
        const extra = data.failed_count ? `, ${data.failed_count} non risolti` : '';
        toast.success(`${data.fixed} indirizzi corretti${extra}`);
      }
      fetchData();
    } catch {
      toast.error('Riparazione indirizzi non riuscita');
    } finally {
      setRepairing(false);
    }
  };

  const exportCsv = () => {
    const rows = (sorted && sorted.length ? sorted : filtered) || [];
    if (!rows.length) {
      toast.info('Nessuna consegna da esportare');
      return;
    }
    const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['Data', 'Cliente', 'Telefono', 'Indirizzo', 'Stato', 'Fattorino', 'Pagamento', 'Importo', 'Pagato con', 'Resto', 'Riferimento vendita', 'Motivo mancata consegna', 'Priorita', 'Note'];
    const lines = [header.join(',')];
    rows.forEach((d) => {
      const driver = safeDrivers.find((dr) => dr.driver_id === d.driver_id);
      lines.push([
        d.created_at ? new Date(d.created_at).toLocaleString('it-IT') : '',
        d.customer_name,
        d.customer_phone,
        d.customer_address,
        STATUS_LABELS[d.status] || d.status,
        driver?.name || '',
        d.payment_method === 'cash' ? 'Contanti' : 'POS',
        d.amount != null ? String(d.amount).replace('.', ',') : '',
        d.amount_given != null ? String(d.amount_given).replace('.', ',') : '',
        d.change_due != null ? String(d.change_due).replace('.', ',') : '',
        d.external_ref || '',
        d.failure_reason || '',
        PRIORITY_LABELS[d.priority] || '',
        d.notes || '',
      ].map(esc).join(','));
    });
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consegne-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} consegne esportate`);
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
    const azione = avanzamentoFarmacia(delivery.status);
    if (!azione) return;
    const nextStatus = azione.stato;
    if (delivery.status === 'assigned' && !delivery.driver_id) {
      toast.error('Assegna prima un fattorino per avviare la consegna');
      setSelectedDelivery(delivery);
      setAssignDialogOpen(true);
      return;
    }
    const label = azione.etichetta;
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

  const activeBadgeCount = useMemo(() => ensureArray(deliveries).filter(d => ['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit'].includes(d.status)).length, [deliveries]);
  useEffect(() => {
    document.title = activeBadgeCount > 0 ? `(${activeBadgeCount}) PharmaTrack` : 'PharmaTrack';
  }, [activeBadgeCount]);

  const filtered = useMemo(() => safeDeliveries.filter(d => {
    const matchTab = activeTab === 'active'
      ? ['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status)
      : activeTab === 'pending_confirmation'
        ? d.status === 'delivered_pending_confirmation'
        : ['delivered', 'cancelled', 'not_delivered'].includes(d.status);
    const cerca = searchTerm.toLowerCase();
    const matchSearch = !searchTerm ||
      (d.customer_name || '').toLowerCase().includes(cerca) ||
      (d.customer_address || '').toLowerCase().includes(cerca) ||
      (d.customer_phone || '').toLowerCase().includes(cerca) ||
      (d.nre || '').toLowerCase().includes(cerca) ||
      (d.notes || '').toLowerCase().includes(cerca);
    const matchDriver = filterDriver === 'all' || d.driver_id === filterDriver ||
      (filterDriver === 'unassigned' && !d.driver_id);
    return matchTab && matchSearch && matchDriver;
  }), [safeDeliveries, activeTab, searchTerm, filterDriver]);
  const listIsCapped = safeDeliveries.length >= 500;

  // V17: la lista attiva si ordina per priorità reale, poi orario, poi data
  // I quattro gesti che una riga puo' chiedere alla pagina. Stavano dentro il
  // markup della riga, il che rendeva impossibile leggerla senza la pagina.
  const apriModifica = (delivery) => {
    setSelectedDelivery(delivery);
    setForm({ ...form, notes: delivery.notes || '', payment_method: delivery.payment_method || 'cash', amount: delivery.amount || '', amount_given: delivery.amount_given || '', scheduled_date: delivery.scheduled_date || '', scheduled_time: delivery.scheduled_time || '', slot_to: delivery.slot_to || null, status: delivery.status || null, force_reason: '' });
    setFasciaScelta((fasciaDi(delivery.scheduled_time, delivery.slot_to) || { valore: 'subito' }).valore);
    setEditDialogOpen(true);
  };

  const apriPronta = (delivery) => {
    setSelectedDelivery(delivery);
    setForm({ ...form, payment_method: delivery.payment_method || 'cash', amount: delivery.amount || '', amount_given: delivery.amount_given || '' });
    setProntaDialogOpen(true);
  };

  const apriAssegna = (delivery) => {
    setSelectedDelivery(delivery);
    setAssignDialogOpen(true);
  };

  const stampaBolla = (delivery) => printDeliverySlip(delivery, safeDrivers, user);

  const sorted = useMemo(() => {
    if (activeTab !== 'active') return filtered;
    const rank = (d) => ({ urgent: 0, high: 1, normal: 2, low: 3 }[d.priority || 'normal'] ?? 2);
    return [...filtered].sort((a, b) =>
      rank(a) - rank(b) ||
      (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99') ||
      (b.created_at || '').localeCompare(a.created_at || ''));
  }, [filtered, activeTab]);

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
  const frequentCustomers = useMemo(() => {
    const counts = new Map();
    (deliveries || []).forEach((d) => { if (d.customer_id) counts.set(d.customer_id, (counts.get(d.customer_id) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id]) => safeCustomers.find((c) => c.customer_id === id)).filter(Boolean);
  }, [deliveries, safeCustomers]);

  const selectCustomer = (c) => {
    setForm((prev) => ({ ...prev, customer_id: c.customer_id }));
    setCustomerSearchTerm('');
    setCustomerDropdownOpen(false);
    setActiveCustomerIndex(-1);
  };

  const shareDelivery = async (d) => {
    try {
      const res = await axios.post(`${API}/deliveries/${d.delivery_id}/share-link`, {}, { withCredentials: true });
      const url = `${window.location.origin}/t/${res.data.token}`;
      const firstName = (d.customer_name || '').split(' ')[0] || 'cliente';
      const msg = `Ciao ${firstName}, puoi seguire la tua consegna in tempo reale: ${url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
      toast.success('Link tracking creato (valido 72 ore)');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Impossibile creare il link');
    }
  };

  const selectedCustomer = safeCustomers.find(c => c.customer_id === form.customer_id) || null;

  // V28: ultima consegna del cliente selezionato (per "Ripeti")

  if (loading) return <Layout title="Consegne"><div className="p-4"><ListSkeleton rows={8} /></div></Layout>;

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
            <Button className="btn-primary hidden sm:inline-flex" size="sm" onClick={() => { resetForm(); dialogOpenedAtRef.current = Date.now(); setDialogOpen(true); }}>
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
          <Button
            variant="outline"
            size="sm"
            className="h-10 sm:h-9 w-full sm:w-auto"
            onClick={exportCsv}
            data-testid="export-deliveries-csv"
          >
            <Download className="w-4 h-4 mr-1.5" />Esporta CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 sm:h-9 w-full sm:w-auto"
            onClick={repairCoordinates}
            disabled={repairing}
            title="Ricalcola le coordinate delle consegne aperte con indirizzi approssimativi"
            data-testid="repair-coordinates"
          >
            <MapPin className="w-4 h-4 mr-1.5" />{repairing ? 'Riparo...' : 'Ripara indirizzi'}
          </Button>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="h-10 sm:h-9 w-full sm:w-auto">
              <TabsTrigger value="active" className="flex-1 sm:flex-none text-[11px] sm:text-xs px-2 sm:px-3">Attive {activeCount > 0 && <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-primary/15 text-primary font-bold">{activeCount}</span>}</TabsTrigger>
              <TabsTrigger value="pending_confirmation" className="flex-1 sm:flex-none text-[11px] sm:text-xs px-2 sm:px-3">
                <Euro className="w-3 h-3 mr-1" />Da incassare
                {pendingConfirmCount > 0 && <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">{pendingConfirmCount}</span>}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex-1 sm:flex-none text-[11px] sm:text-xs px-2 sm:px-3">Completate</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Deliveries list */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">
                {listIsCapped && (
                <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                  Stai vedendo le 500 consegne più recenti: usa la ricerca o l'archivio per le altre.
                </p>
              )}
              {searchTerm ? 'Nessuna consegna trovata' : activeTab === 'active' ? 'Nessuna consegna attiva' : 'Archivio vuoto'}
              </p>
              {!searchTerm && activeTab === 'active' && (
                <Button className="btn-primary mt-4" size="sm" onClick={() => { resetForm(); dialogOpenedAtRef.current = Date.now(); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1.5" />Crea la prima consegna
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
{sorted.map((d) => (
              <DeliveryRow
                key={d.delivery_id}
                d={d}
                drivers={safeDrivers}
                inRitardo={inRitardo}
                handlers={{
                  handleConfirmPayment,
                  handleDisputePayment,
                  handleAdvanceStatus,
                  handleCancel,
                  handleRestore,
                  shareDelivery,
                  onPrintSlip: stampaBolla,
                  apriModifica,
                  apriPronta,
                  apriAssegna,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB mobile: Nuova Consegna */}
      <button
        className="lg:hidden fixed bottom-24 right-4 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        onClick={() => { resetForm(); dialogOpenedAtRef.current = Date.now(); setDialogOpen(true); }}
        aria-label="Nuova Consegna">
        <Plus className="w-6 h-6" />
      </button>

      <CreaConsegnaDialog
        modulo={modulo}
        {...{
        activeCustomerIndex,
        applicaFascia,
        customerDropdownOpen,
        customerInputRef,
        customerSearchTerm,
        dialogCustomers,
        dialogOpen,
        frequentCustomers,
        handleCreate,
        openCreateCustomer,
        resetForm,
        selectCustomer,
        selectedCustomer,
        setActiveCustomerIndex,
        setCustomerDropdownOpen,
        setCustomerSearchTerm,
        setDialogOpen,
        }}
      />

      <SegnaProntaDialog

        modulo={modulo}
        {...{
        handleMarkPronta,
        prontaDialogOpen,
        resetForm,
        setProntaDialogOpen,
        setSelectedDelivery,
        }}
      />

      <ModificaConsegnaDialog

        modulo={modulo}
        {...{
        editDialogOpen,
        handleEdit,
        setEditDialogOpen,
        }}
      />

      <AssegnaConsegnaDialog

        modulo={modulo}
        {...{
        assignDialogOpen,
        handleAssign,
        safeDrivers,
        selectedDelivery,
        setAssignDialogOpen,
        }}
      />

      <NuovoClienteDialog

        modulo={modulo}
        {...{
        createCustomerOpen,
        creatingCustomer,
        handleCreateCustomer,
        newCustomer,
        setCreateCustomerOpen,
        setNewCustomer,
        }}
      />
    </Layout>
  );
}

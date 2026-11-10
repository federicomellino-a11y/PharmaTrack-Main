import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeliveriesQuery, useCustomersQuery, useDriversQuery } from '@/hooks/queries';
import { ListSkeleton } from '../../components/Skeletons';
import axios from 'axios';
import { API } from '@/lib/config';
import { fasciaDi, fasceDellaFarmacia } from '@/lib/fasce';
import BarraConsegne from '../../components/deliveries/BarraConsegne';
import ListaConsegne from '../../components/deliveries/ListaConsegne';
import { consegneAperteDelCliente } from '@/lib/consegneAperte';
import { Layout } from '../../components/Layout';
import { Dialog } from '../../components/ui/dialog';
import { Filter } from 'lucide-react';
import { toast } from 'sonner';

// Il limite del piano arriva come 402: va spiegato, non mostrato come guasto.
import printDeliverySlip from '@/lib/printDeliverySlip';
const messaggioPiano = (errore, ripiego) =>
  errore?.response?.status === 402
    ? (errore.response.data?.detail || 'Limite del piano raggiunto.')
    : ripiego;
import { useAuth } from '../../contexts/AuthContext';
import { ensureArray } from '@/lib/collections';
import useDeliveryForm, { normalizzaImporto } from '@/hooks/useDeliveryForm';
import useAzioniConsegna from '@/hooks/useAzioniConsegna';
import CreaConsegnaDialog from '../../components/deliveries/CreaConsegnaDialog';
import SegnaProntaDialog from '../../components/deliveries/SegnaProntaDialog';
import { costruisciCorrezioneStato } from '@/lib/deliveryCorrection';
import ModificaConsegnaDialog from '../../components/deliveries/ModificaConsegnaDialog';
import AssegnaConsegnaDialog from '../../components/deliveries/AssegnaConsegnaDialog';
import NuovoClienteDialog from '../../components/deliveries/NuovoClienteDialog';




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
  const [filterDriver, setFilterDriver] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [prontaDialogOpen, setProntaDialogOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  // La fascia scelta è uno stato suo: derivarla dai valori non permetteva
  // Le fasce sono quelle della farmacia (Impostazioni > Consegne), non piu' una
  // lista uguale per tutti.
  const fasce = useMemo(() => fasceDellaFarmacia(user), [user]);
  const fasciaIniziale = useMemo(() => {
    const scelta = user?.settings?.fascia_predefinita;
    return fasce.find((fascia) => fascia.valore === scelta) || fasce[0];
  }, [fasce, user]);

  // Stato del modulo consegna: vive in hooks/useDeliveryForm.js
  const modulo = useDeliveryForm({ fasciaIniziale });
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
      setFasciaScelta((fasciaDi(winfarmPrefill.scheduled_time, null, fasce) || { valore: 'subito' }).valore);
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

  const { confermaIncasso, contestaIncasso, annulla, ripristina, avanzaStato } = useAzioniConsegna({
    ricarica: fetchData,
    onAssegnaRichiesta: (consegna) => { setSelectedDelivery(consegna); setAssignDialogOpen(true); },
  });

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
    const scelta = fasce.find((f) => f.valore === valore);
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

  // Filter deliveries (memoizzato per evitare ricalcolo ad ogni render)
  const safeDeliveries = useMemo(() => ensureArray(deliveries), [deliveries]);
  const safeCustomers = useMemo(() => ensureArray(customers), [customers]);
  const safeDrivers = useMemo(() => ensureArray(drivers), [drivers]);

  // Lo stesso cliente non deve entrare due volte nello stesso giro: l'avviso
  // arriva qui, mentre si compila, non dal 409 del server dopo.
  const consegneAperteCliente = useMemo(
    () => consegneAperteDelCliente(safeDeliveries, form.customer_id),
    [safeDeliveries, form.customer_id]
  );

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

        <BarraConsegne
          attive={activeCount}
          inAttesa={pendingCount}
          daConfermare={pendingConfirmCount}
          inAggiornamento={refreshing}
          cerca={searchTerm}
          fattorino={filterDriver}
          fattorini={safeDrivers}
          scheda={activeTab}
          onAggiorna={() => { setRefreshing(true); fetchData(); }}
          onNuova={() => { resetForm(); dialogOpenedAtRef.current = Date.now(); setDialogOpen(true); }}
          onCerca={setSearchTerm}
          onFattorino={setFilterDriver}
          onScheda={setActiveTab}
        />

        <ListaConsegne
          consegne={sorted}
          nessuna={filtered.length === 0}
          cerca={searchTerm}
          scheda={activeTab}
          listIsCapped={listIsCapped}
          fattorini={safeDrivers}
          onNuova={() => { resetForm(); dialogOpenedAtRef.current = Date.now(); setDialogOpen(true); }}
          gestori={{
            handleConfirmPayment: confermaIncasso,
            handleDisputePayment: contestaIncasso,
            handleAdvanceStatus: avanzaStato,
            handleCancel: annulla,
            handleRestore: ripristina,
            shareDelivery,
            onPrintSlip: stampaBolla,
            apriModifica,
            apriPronta,
            apriAssegna,
          }}
        />
      </div>

      <CreaConsegnaDialog
        modulo={modulo}
        {...{
        fasce,
        activeCustomerIndex,
        applicaFascia,
        customerDropdownOpen,
        customerInputRef,
        consegneAperte: consegneAperteCliente,
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

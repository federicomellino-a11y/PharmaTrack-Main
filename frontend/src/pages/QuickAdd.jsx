import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { useQueryClient } from '@tanstack/react-query';
import { useCustomersQuery, useDeliveriesQuery, useDriversQuery } from '@/hooks/queries';
import { fasceDellaFarmacia, FASCIA_PRIMA } from '@/lib/fasce';
import { opzioniPulsante, dataConsegna, noteConsegna } from '@/lib/pulsanteMagico';
import { printDeliveryLabel } from '@/lib/printLabel';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { avvisoConsegnaAperta, consegneAperteDelCliente } from '@/lib/consegneAperte';
import { Search, User, Plus, Package, CheckCircle2, Zap, Banknote, CreditCard, Clock } from 'lucide-react';

const PRIORITIES = [
  { id: 'normal', label: 'Normale', dot: 'bg-emerald-500' },
  { id: 'high', label: 'Alta', dot: 'bg-amber-500' },
  { id: 'urgent', label: 'Urgente', dot: 'bg-destructive' },
];

const oraCorta = (ora) => (ora || '').replace(/^0/, '').replace(/:00$/, '');
const ensureArrayLocal = (value) => (Array.isArray(value) ? value : []);

export default function QuickAddPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('customer_name') || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: searchParams.get('customer_name') || '',
    phone: '',
    address: '',
    fiscal_code: searchParams.get('fiscal_code') || '',
  });
  const [externalRef] = useState(searchParams.get('external_ref') || '');
  const [form, setForm] = useState({
    notes: searchParams.get('notes') || '',
    amount: searchParams.get('amount') || '',
    amount_given: '',
    payment_method: searchParams.get('payment_method') || 'cash',
    priority: 'normal',
    fascia: FASCIA_PRIMA.valore,
    giorno: 'oggi',
    driver_id: '',
    contenuto: '',
  });
  const pezzi = searchParams.get('pezzi') || '';
  const daWinfarm = searchParams.get('origine') === 'winfarm';
  const opzioni = useMemo(() => opzioniPulsante(user), [user]);
  // Solo fasce pronte: l'orario preciso resta nel modulo completo delle consegne.
  const fasce = useMemo(() => fasceDellaFarmacia(user).filter((f) => f.da !== '__manuale__'), [user]);
  const { data: fattorini } = useDriversQuery({ enabled: opzioni.fattorino });
  const [creating, setCreating] = useState(false);
  // Arrivo dal pulsante magico: il cliente va scelto in anagrafica, non inventato.
  // Due casi: il cliente e' stato letto (va cercato) oppure in Winfarm non c'era
  // nessun cliente selezionato (si sceglie qui, con l'importo gia' scritto).
  const customerFromSale = !!searchParams.get('customer_name');
  const arrivoDaVendita = !!(searchParams.get('customer_name')
    || searchParams.get('fiscal_code')
    || searchParams.get('origine'));
  const [created, setCreated] = useState(null);

  const queryClient = useQueryClient();
  const { data: customersCache } = useCustomersQuery();
  const { data: activeDeliveriesCache } = useDeliveriesQuery('active');

  useEffect(() => {
    if (customersCache) setCustomers(ensureArrayLocal(customersCache));
  }, [customersCache]);

  useEffect(() => {
    if (activeDeliveriesCache) setDeliveries(ensureArrayLocal(activeDeliveriesCache));
  }, [activeDeliveriesCache]);

  // Arrivo dai Richiami: il paziente e' gia' deciso, non si cerca nulla.
  const customerIdDaLink = searchParams.get('customer_id');
  useEffect(() => {
    if (!customerIdDaLink || selectedCustomer) return;
    const trovato = customers.find((c) => c.customer_id === customerIdDaLink);
    if (trovato) setSelectedCustomer(trovato);
  }, [customerIdDaLink, customers, selectedCustomer]);

  useEffect(() => { document.title = 'PharmaTrack · Quick'; }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !created) { try { window.close(); } catch { /* noop */ } } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [created]);

  const load = async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
      ]);
    } catch { toast.error('Errore di caricamento'); }
  };
  useEffect(() => { load(); }, []);

  // Il pulsante magico passa il codice fiscale: se il cliente esiste si
  // seleziona da solo, senza che nessuno lo cerchi a mano.
  useEffect(() => {
    const cf = (searchParams.get('fiscal_code') || '').trim().toUpperCase();
    if (!cf || selectedCustomer || !(customers || []).length) return;
    const trovato = customers.find((c) => (c.fiscal_code || '').toUpperCase() === cf);
    if (trovato) {
      setSelectedCustomer(trovato);
      setSearchTerm('');
    }
  }, [customers, selectedCustomer, searchParams]);

  // Stesso nome, un solo cliente in anagrafica: e' lui, non serve cercarlo.
  const nomeDaVendita = (searchParams.get('customer_name') || '').trim().toLowerCase();
  const [nomeProvato, setNomeProvato] = useState(false);
  useEffect(() => {
    if (nomeProvato || !nomeDaVendita || selectedCustomer || !(customers || []).length) return;
    setNomeProvato(true);
    const uguali = customers.filter((c) => (c.name || '').trim().toLowerCase() === nomeDaVendita);
    if (uguali.length === 1) { setSelectedCustomer(uguali[0]); setSearchTerm(''); }
  }, [customers, nomeDaVendita, nomeProvato, selectedCustomer]);

  const recentCustomers = useMemo(() => {
    const seen = new Map();
    const sorted = [...(deliveries || [])].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const out = [];
    for (const d of sorted) {
      if (d.customer_id && !seen.has(d.customer_id)) {
        seen.set(d.customer_id, true);
        const c = (customers || []).find((x) => x.customer_id === d.customer_id);
        if (c) out.push(c);
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [deliveries, customers]);

  const list = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return recentCustomers;
    return (customers || []).filter((c) =>
      (c.name || '').toLowerCase().includes(term) ||
      (c.phone || '').includes(term) ||
      (c.fiscal_code || '').toLowerCase().includes(term) ||
      (c.address || '').toLowerCase().includes(term)
    ).slice(0, 8);
  }, [searchTerm, customers, recentCustomers]);

  // Lo stesso cliente due volte in un giorno e' quasi sempre un doppione: si
  // vede prima di premere, non dopo (il server lo blocca a consegna creata).
  // La regola sta in lib/consegneAperte.js: qui e in Consegne deve dire lo stesso.
  const consegneAperte = useMemo(
    () => consegneAperteDelCliente(ensureArrayLocal(deliveries), selectedCustomer?.customer_id),
    [deliveries, selectedCustomer]
  );
  const avviso = avvisoConsegnaAperta(consegneAperte);

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setSearchTerm('');
    setDropdownOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!dropdownOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0 && list[activeIndex]) { e.preventDefault(); selectCustomer(list[activeIndex]); }
    else if (e.key === 'Escape') { setDropdownOpen(false); }
  };

  const createCustomer = async () => {
    if (!newCustomer.name.trim()) { toast.error('Il nome è obbligatorio'); return; }
    // Senza indirizzo il fattorino non sa dove andare: il cliente si crea
    // completo, non a meta'.
    if (!(newCustomer.address || '').trim()) {
      toast.error("Serve l'indirizzo: senza, la consegna non si puo' fare");
      return;
    }
    try {
      const { data } = await axios.post(`${API}/customers`, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        fiscal_code: (newCustomer.fiscal_code || '').trim().toUpperCase() || null,
        address: newCustomer.address.trim() || null,
        customer_lat: newCustomer.lat || null,
        customer_lng: newCustomer.lng || null,
        place_id: newCustomer.placeId || null,
      }, { withCredentials: true });
      setNewCustomerOpen(false);
      setNewCustomer({ name: '', phone: '', address: '', fiscal_code: '' });
      setCustomers((prev) => [...prev, data]);
      selectCustomer(data);
      toast.success(`Cliente "${data.name}" creato`);
    } catch { toast.error('Errore creazione cliente'); }
  };

  const amount = parseFloat(form.amount) || 0;
  const given = parseFloat(form.amount_given) || 0;
  const resto = given > 0 && amount > 0 ? given - amount : null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) { toast.error('Seleziona un cliente'); return; }
    if (form.payment_method === 'cash' && given > 0 && given < amount) { toast.error('Il pagato con è inferiore all\'importo'); return; }
    setCreating(true);
    try {
      const fascia = fasce.find((f) => f.valore === form.fascia);
      const payload = {
        customer_id: selectedCustomer.customer_id,
        notes: noteConsegna({ note: form.notes, contenuto: form.contenuto, pezzi, conSacchetto: opzioni.farmaci }),
        amount: form.amount === '' ? null : amount,
        amount_given: form.amount_given === '' ? null : given,
        payment_method: form.payment_method,
        priority: form.priority,
        scheduled_date: dataConsegna(form.giorno),
        scheduled_time: fascia?.da || null,
        slot_to: fascia?.a || null,
        driver_id: (opzioni.fattorino && form.driver_id) || null,
        external_ref: externalRef || null,
        imported_from: daWinfarm ? 'winfarm' : null,
      };
      const { data } = await axios.post(`${API}/deliveries`, payload, { withCredentials: true });
      if (opzioni.etichetta) printDeliveryLabel({ ...payload, ...data, customer_name: selectedCustomer.name, customer_address: selectedCustomer.address, customer_phone: selectedCustomer.phone });
      setCreated({
        name: selectedCustomer.name,
        amount: amount || null,
        resto,
        quando: `${form.giorno === 'domani' ? 'Domani' : 'Oggi'} · ${fascia?.da ? `${fascia.da}–${fascia.a}` : 'prima possibile'}`,
      });
      setTimeout(() => {
        try { window.close(); } catch { /* noop */ }
        setTimeout(() => { if (!window.closed) window.location.href = '/deliveries'; }, 150);
      }, 2500);
    } catch (err) {
      const dettaglio = err.response?.data?.detail;
      toast.error(typeof dettaglio === 'string' ? dettaglio : dettaglio?.motivo || 'Errore creazione consegna');
    }
    setCreating(false);
  };

  const reset = () => {
    setCreated(null);
    setSelectedCustomer(null);
    setForm({ notes: '', amount: '', amount_given: '', payment_method: 'cash', priority: 'normal', fascia: FASCIA_PRIMA.valore, giorno: 'oggi', driver_id: '', contenuto: '' });
  };

  if (created) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 className="w-16 h-16 text-primary" />
        <p className="text-lg font-semibold">Consegna creata</p>
        <p className="text-sm text-muted-foreground">{created.name}</p>
        <p className="text-sm font-medium" data-testid="qa-creata-quando">{created.quando}</p>
        {created.amount != null && <p className="text-2xl font-bold tabular-nums">€ {created.amount.toFixed(2).replace('.', ',')}</p>}
        {created.resto != null && <p className="text-sm">Resto: <span className="font-bold text-primary">€ {created.resto.toFixed(2).replace('.', ',')}</span></p>}
        <p className="text-xs text-muted-foreground">Chiusura automatica…</p>
        <Button variant="outline" size="sm" onClick={reset}>Nuova consegna</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <Zap className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="text-sm font-semibold">Nuova consegna</h1>
          {externalRef && (
            <span className="ml-auto truncate rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground" data-testid="qa-scontrino">
              {externalRef}
            </span>
          )}
        </header>

        <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-2 px-3 pb-20 pt-2" data-testid="qa-form">
          {/* 1. Il cliente: e' la scelta che conta, quindi viene per prima */}
          <section className="rounded-xl border bg-card p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</p>
              {selectedCustomer && (
                <button type="button" className="text-xs font-medium text-primary" onClick={() => setSelectedCustomer(null)}>
                  Cambia
                </button>
              )}
            </div>

            {selectedCustomer ? (
              <div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {selectedCustomer.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">{selectedCustomer.name}</p>
                    <p className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">
                      {selectedCustomer.phone ? `${selectedCustomer.phone} · ` : ''}{selectedCustomer.address}
                    </p>
                  </div>
                </div>
                {avviso && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2" data-testid="avviso-consegna-aperta">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                      {avviso}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  className="h-9 pl-9" data-testid="qa-cerca-cliente"
                  placeholder="Cerca per nome, telefono o CF"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setDropdownOpen(true); setActiveIndex(-1); }}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-lg">
                    <div className="max-h-64 overflow-y-auto">
                      {!searchTerm && recentCustomers.length > 0 && (
                        <p className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Usati di recente</p>
                      )}
                      {list.length === 0 ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 p-3 text-left text-sm hover:bg-accent"
                          onMouseDown={() => { setNewCustomerOpen(true); setNewCustomer({ name: searchTerm, phone: '', address: '', fiscal_code: '' }); }}
                        >
                          <Plus className="h-4 w-4 text-primary" />
                          Nuovo cliente{searchTerm ? ` "${searchTerm}"` : ''}
                        </button>
                      ) : list.map((c, i) => (
                        <button
                          type="button"
                          key={c.customer_id}
                          className={`flex w-full items-center gap-3 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-0 ${i === activeIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                          onMouseEnter={() => setActiveIndex(i)}
                          onMouseDown={() => selectCustomer(c)}
                        >
                          <User className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.phone ? `${c.phone} · ` : ''}{c.address}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!selectedCustomer && !newCustomerOpen && (
              <button
                type="button"
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                onClick={() => setNewCustomerOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />Aggiungi un cliente
              </button>
            )}

            {!selectedCustomer && arrivoDaVendita && !newCustomerOpen && (
              <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400" data-testid="qa-avviso-cliente">
                {customerFromSale ? 'Cliente non in anagrafica: sceglilo o aggiungilo.' : 'Nessun cliente in Winfarm: sceglilo qui.'}
              </p>
            )}

            {newCustomerOpen && (
              <div className="mt-3 space-y-2 rounded-xl border border-dashed p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nuovo cliente</p>
                <Input placeholder="Nome e cognome" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                <Input
                  placeholder="Codice fiscale"
                  value={newCustomer.fiscal_code || ''}
                  onChange={(e) => setNewCustomer({ ...newCustomer, fiscal_code: e.target.value.toUpperCase() })}
                  maxLength={16}
                  className="font-mono uppercase"
                />
                <Input placeholder="Telefono" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                <AddressAutocomplete
                  placeholder="Indirizzo di consegna"
                  testId="qa-address-input"
                  value={newCustomer.address}
                  onChange={(value) => setNewCustomer((p) => ({ ...p, address: value, lat: null, lng: null, placeId: '' }))}
                  onAddressSelect={(sel) => setNewCustomer((p) => ({ ...p, address: sel.address, lat: sel.lat, lng: sel.lng, placeId: sel.placeId || '' }))}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={createCustomer}
                    disabled={!newCustomer.name.trim() || !(newCustomer.address || '').trim()}
                  >
                    Crea e usa
                  </Button>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setNewCustomerOpen(false)}>
                    Annulla
                  </button>
                </div>
                {!(newCustomer.address || '').trim() && (
                  <p className="text-[11px] text-muted-foreground">L\'indirizzo serve per la consegna.</p>
                )}
              </div>
            )}
          </section>

          {/* 2. Il denaro, su una riga */}
          <section className="rounded-xl border bg-card p-3">
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Da pagare €</Label>
                <Input type="number" step="0.01" inputMode="decimal" min="0" placeholder="0,00" value={form.amount}
                  className="h-9 text-base font-semibold tabular-nums" data-testid="qa-importo"
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Ricevuto €</Label>
                <Input type="number" step="0.01" inputMode="decimal" min="0" placeholder="0,00" value={form.amount_given}
                  className="h-9 tabular-nums" data-testid="qa-ricevuto"
                  onChange={(e) => setForm({ ...form, amount_given: e.target.value })} />
              </div>
              <div className="flex overflow-hidden rounded-lg border">
                {[{ id: 'cash', icona: Banknote, nome: 'Contanti' }, { id: 'pos', icona: CreditCard, nome: 'POS' }].map(({ id, icona: Icona, nome }) => (
                  <button type="button" key={id} title={nome} aria-label={nome} data-testid={`qa-pagamento-${id}`}
                    onClick={() => setForm({ ...form, payment_method: id })}
                    className={`flex h-9 w-10 items-center justify-center transition-colors ${form.payment_method === id ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}>
                    <Icona className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            {resto != null && (
              <p className="mt-2 flex items-baseline justify-between rounded-lg bg-primary/5 px-2.5 py-1 text-xs text-muted-foreground" data-testid="qa-resto">
                Resto <span className="text-base font-bold tabular-nums text-primary">€ {resto.toFixed(2).replace('.', ',')}</span>
              </p>
            )}
          </section>

          {/* 3. Quando: giorno e fascia, un tocco ciascuno */}
          <section className="rounded-xl border bg-card p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3 w-3" />Consegna
              </p>
              <div className="flex overflow-hidden rounded-md border text-[11px] font-medium">
                {['oggi', 'domani'].map((giorno) => (
                  <button type="button" key={giorno} data-testid={`qa-giorno-${giorno}`}
                    onClick={() => setForm({ ...form, giorno })}
                    className={`px-2.5 py-1 capitalize transition-colors ${form.giorno === giorno ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                    {giorno}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fasce.map((fascia) => (
                <button type="button" key={fascia.valore} data-testid={`qa-fascia-${fascia.valore}`}
                  onClick={() => setForm({ ...form, fascia: fascia.valore })}
                  className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${form.fascia === fascia.valore ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                  {fascia.da ? `${fascia.etichetta || ''} ${oraCorta(fascia.da)}–${oraCorta(fascia.a)}`.trim() : 'Prima possibile'}
                </button>
              ))}
            </div>
          </section>

          {/* 4. Il resto: note, priorita' e gli extra accesi da Impostazioni */}
          <section className="space-y-2 rounded-xl border bg-card p-3">
            {opzioni.fattorino && (
              <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm" data-testid="qa-fattorino" aria-label="Fattorino">
                <option value="">Fattorino: da assegnare</option>
                {ensureArrayLocal(fattorini).filter((f) => f.is_active !== false).map((f) => (
                  <option key={f.driver_id} value={f.driver_id}>{f.name}</option>
                ))}
              </select>
            )}
            {opzioni.farmaci && (
              <div className="flex items-center gap-2">
                <Input className="h-9" placeholder="Contenuto del sacchetto" value={form.contenuto} data-testid="qa-contenuto"
                  onChange={(e) => setForm({ ...form, contenuto: e.target.value })} />
                {pezzi && <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-medium" data-testid="qa-pezzi">{pezzi} pz</span>}
              </div>
            )}
            <Input className="h-9" placeholder="Note per il fattorino (citofono, piano…)" value={form.notes} data-testid="qa-note"
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="grid grid-cols-3 gap-1.5">
              {PRIORITIES.map((p) => (
                <button type="button" key={p.id} data-testid={`qa-priorita-${p.id}`}
                  className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${form.priority === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
                  onClick={() => setForm({ ...form, priority: p.id })}>
                  <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />{p.label}
                </button>
              ))}
            </div>
          </section>

          {!selectedCustomer && (
            <p className="px-1 text-center text-[11px] text-muted-foreground">
              Scegli un cliente per creare la consegna.
            </p>
          )}

          {/* Il pulsante resta sempre a portata di dito, anche in fondo alla pagina */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 py-2 backdrop-blur">
            <div className="mx-auto w-full max-w-md">
              <Button type="submit" disabled={creating || !selectedCustomer} className="h-10 w-full text-sm font-semibold" data-testid="qa-crea">
                <Package className="mr-1.5 h-4 w-4" />
                {creating ? 'Creazione…' : 'Crea consegna'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

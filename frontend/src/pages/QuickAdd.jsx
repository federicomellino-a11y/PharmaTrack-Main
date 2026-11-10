import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { useQueryClient } from '@tanstack/react-query';
import { useCustomersQuery, useDeliveriesQuery } from '@/hooks/queries';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { avvisoConsegnaAperta, consegneAperteDelCliente } from '@/lib/consegneAperte';
import { Search, User, Plus, Package, CheckCircle2, Zap, Banknote, CreditCard } from 'lucide-react';

const PRIORITIES = [
  { id: 'normal', label: 'Normale', dot: 'bg-emerald-500' },
  { id: 'high', label: 'Alta', dot: 'bg-amber-500' },
  { id: 'urgent', label: 'Urgente', dot: 'bg-destructive' },
];

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
  });
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
      const payload = {
        customer_id: selectedCustomer.customer_id,
        notes: form.notes,
        amount: form.amount === '' ? null : amount,
        amount_given: form.amount_given === '' ? null : given,
        payment_method: form.payment_method,
        priority: form.priority,
        external_ref: externalRef || null,
      };
      const { data } = await axios.post(`${API}/deliveries`, payload, { withCredentials: true });
      setCreated({
        name: selectedCustomer.name,
        amount: amount || null,
        resto,
        driver: data?.auto_assigned ? 'assegnata' : 'da smistare',
      });
      setTimeout(() => {
        try { window.close(); } catch { /* noop */ }
        setTimeout(() => { if (!window.closed) window.location.href = '/deliveries'; }, 150);
      }, 2500);
    } catch { toast.error('Errore creazione consegna'); }
    setCreating(false);
  };

  const reset = () => {
    setCreated(null);
    setSelectedCustomer(null);
    setForm({ notes: '', amount: '', amount_given: '', payment_method: 'cash', priority: 'normal' });
  };

  if (created) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <CheckCircle2 className="w-16 h-16 text-primary" />
        <p className="text-lg font-semibold">Consegna creata</p>
        <p className="text-sm text-muted-foreground">{created.name}</p>
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
        {/* Testata: cosa sto facendo, e per quale farmacia */}
        <header className="flex items-center gap-3 px-4 pt-5 pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight">Nuova consegna</h1>
            <p className="truncate text-xs text-muted-foreground">{user?.pharmacy_name || 'PharmaTrack'}</p>
          </div>
        </header>

        <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-3 px-4 pb-32">
          {/* 1. Il cliente: e' la scelta che conta, quindi viene per prima */}
          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-2.5 flex items-center justify-between">
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
                  className="h-11 pl-9"
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
              <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2.5">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {customerFromSale ? 'Cliente non in anagrafica' : 'Vendita letta da Winfarm'}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {customerFromSale
                    ? 'Sceglilo dalla lista, oppure aggiungilo qui con il suo indirizzo: cosi resta in anagrafica.'
                    : 'Scegli il cliente fra i tuoi. L\'indirizzo arriva dalla sua scheda, senza riscriverlo.'}
                </p>
              </div>
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

          {/* 2. Il denaro: importo, contanti ricevuti, resto */}
          <section className="rounded-2xl border bg-card p-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Da pagare</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input type="number" step="0.01" inputMode="decimal" min="0" placeholder="0,00" value={form.amount}
                    className="h-11 pl-7 text-base font-semibold tabular-nums"
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Ricevuto</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                  <Input type="number" step="0.01" inputMode="decimal" min="0" placeholder="0,00" value={form.amount_given}
                    className="h-11 pl-7 text-base tabular-nums"
                    onChange={(e) => setForm({ ...form, amount_given: e.target.value })} />
                </div>
              </div>
            </div>

            {resto != null && (
              <div className="mt-3 flex items-baseline justify-between rounded-xl bg-primary/5 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">Resto</span>
                <span className="text-lg font-bold tabular-nums text-primary">€ {resto.toFixed(2).replace('.', ',')}</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, payment_method: 'cash' })}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors ${form.payment_method === 'cash' ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:bg-accent'}`}
              >
                <Banknote className="h-4 w-4" />Contanti
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, payment_method: 'pos' })}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors ${form.payment_method === 'pos' ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:bg-accent'}`}
              >
                <CreditCard className="h-4 w-4" />POS
              </button>
            </div>
          </section>

          {/* 3. Il resto delle informazioni, in una riga sola */}
          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Note per il fattorino</Label>
              <Input placeholder="Es: citofono, piano, orario" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priorità</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors ${form.priority === p.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
                    onClick={() => setForm({ ...form, priority: p.id })}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {!selectedCustomer && (
            <p className="px-1 text-center text-[11px] text-muted-foreground">
              Scegli un cliente per creare la consegna.
            </p>
          )}

          {/* Il pulsante resta sempre a portata di dito, anche in fondo alla pagina */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto w-full max-w-md">
              <Button type="submit" disabled={creating || !selectedCustomer} className="h-12 w-full text-base font-semibold">
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

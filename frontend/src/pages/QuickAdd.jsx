import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Search, User, Plus, Package, CheckCircle2, X, Zap, XCircle } from 'lucide-react';

const PRIORITIES = [
  { id: 'normal', label: 'Normale', emoji: '🟢' },
  { id: 'high', label: 'Alta', emoji: '🟡' },
  { id: 'urgent', label: 'Urgente', emoji: '🔴' },
];

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
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [form, setForm] = useState({
    notes: searchParams.get('notes') || '',
    amount: searchParams.get('amount') || '',
    amount_given: '',
    payment_method: searchParams.get('payment_method') || 'cash',
    priority: 'normal',
  });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => { document.title = 'PharmaTrack · Quick'; }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !created) { try { window.close(); } catch { /* noop */ } } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [created]);

  const load = async () => {
    try {
      const [c, d] = await Promise.all([
        axios.get(`${API}/customers`, { withCredentials: true }),
        axios.get(`${API}/deliveries?status=active`, { withCredentials: true }),
      ]);
      setCustomers(c.data || []);
      setDeliveries(d.data || []);
    } catch { toast.error('Errore di caricamento'); }
  };
  useEffect(() => { load(); }, []);

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
      (c.address || '').toLowerCase().includes(term)
    ).slice(0, 8);
  }, [searchTerm, customers, recentCustomers]);

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
    try {
      const { data } = await axios.post(`${API}/customers`, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        customer_lat: newCustomer.lat || null,
        customer_lng: newCustomer.lng || null,
        place_id: newCustomer.placeId || null,
      }, { withCredentials: true });
      setNewCustomerOpen(false);
      setNewCustomer({ name: '', phone: '', address: '' });
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
    <div className="min-h-screen bg-background p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">Consegna rapida</h1>
        <span className="ml-auto text-xs text-muted-foreground">{user?.pharmacy_name || ''}</span>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Cliente</Label>
          {selectedCustomer ? (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
              <User className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedCustomer.phone ? `${selectedCustomer.phone} · ` : ''}{selectedCustomer.address}</p>
              </div>
              <button type="button" onClick={() => setSelectedCustomer(null)} className="text-muted-foreground hover:text-destructive"><XCircle className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Nome, telefono… (frecce + Invio)"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setDropdownOpen(true); setActiveIndex(-1); }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              {dropdownOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    {!searchTerm && recentCustomers.length > 0 && (
                      <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Recenti</p>
                    )}
                    {list.length === 0 ? (
                      <button type="button" className="w-full p-3 text-left text-sm hover:bg-accent flex items-center gap-2"
                        onMouseDown={() => { setNewCustomerOpen(true); setNewCustomer({ name: searchTerm, phone: '', address: '' }); }}>
                        <Plus className="w-4 h-4 text-primary" /> Crea cliente "{searchTerm || 'nuovo'}"
                      </button>
                    ) : list.map((c, i) => (
                      <button type="button" key={c.customer_id}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/50 last:border-0 ${i === activeIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={() => selectCustomer(c)}>
                        <User className="w-3.5 h-3.5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.phone ? `${c.phone} · ` : ''}{c.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!selectedCustomer && !newCustomerOpen && !searchTerm && recentCustomers.length === 0 && (
            <button type="button" className="text-xs text-primary flex items-center gap-1"
              onClick={() => setNewCustomerOpen(true)}>
              <Plus className="w-3 h-3" />Nuovo cliente
            </button>
          )}
        </div>

        {newCustomerOpen && (
          <div className="p-3 rounded-xl border border-border space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuovo cliente</p>
            <Input placeholder="Nome *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
            <Input placeholder="Telefono" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            <AddressAutocomplete
                placeholder="Indirizzo (opzionale)"
                testId="qa-address-input"
                value={newCustomer.address}
                onChange={(value) => setNewCustomer((p) => ({ ...p, address: value, lat: null, lng: null, placeId: '' }))}
                onAddressSelect={(sel) => setNewCustomer((p) => ({ ...p, address: sel.address, lat: sel.lat, lng: sel.lng, placeId: sel.placeId || '' }))}
              />
            <Button type="button" size="sm" onClick={createCustomer}>Crea e seleziona</Button>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={() => setForm({ ...form, payment_method: 'cash' })}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border ${form.payment_method === 'cash' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>💵 Contanti</button>
          <button type="button" onClick={() => setForm({ ...form, payment_method: 'pos' })}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border ${form.payment_method === 'pos' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>💳 POS</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Importo (€)</Label>
            <Input type="number" step="0.01" inputMode="decimal" min="0" placeholder="0,00" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Pagato con (€)</Label>
            <Input type="number" step="0.01" inputMode="decimal" min="0" placeholder="0,00" value={form.amount_given}
              onChange={(e) => setForm({ ...form, amount_given: e.target.value })} />
          </div>
        </div>
        {resto != null && (
          <p className="text-sm">Resto: <span className="text-xl font-bold text-primary tabular-nums">€ {resto.toFixed(2).replace('.', ',')}</span></p>
        )}

        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button type="button" key={p.id}
              className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${form.priority === p.id ? 'border-primary bg-primary/10' : 'border-border'}`}
              onClick={() => setForm({ ...form, priority: p.id })}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Note</Label>
          <Input placeholder="Es: Augmentin 1g…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <Button type="submit" disabled={creating || !selectedCustomer} className="w-full h-12 text-base font-bold">
          <Package className="w-4 h-4 mr-1.5" />{creating ? 'Creazione…' : 'CREA CONSEGNA'}
        </Button>
      </form>
    </div>
  );
}

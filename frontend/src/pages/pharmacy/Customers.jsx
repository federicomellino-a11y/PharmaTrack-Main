import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import {
  Search, Plus, Pencil, Trash2, Phone, MapPin, User, FileText,
  Mail, CreditCard, Package, Clock, Euro, ArrowLeft,
  CheckCircle2, XCircle, Navigation, ShieldCheck, ChevronRight,
  TrendingUp, Wallet, Activity, Sparkles, PlusCircle, X
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray, ensureObject } from '@/lib/collections';


const statusLabels = {
  pending: 'In attesa',
  assigned: 'Assegnata',
  picked_up: 'Ritirata',
  in_transit: 'In consegna',
  delivered: 'Consegnata',
  cancelled: 'Annullata',
};

const paymentLabels = {
  cash: 'Contanti',
  pos: 'POS',
  other: 'Altro',
};

const emptyForm = {
  name: '',
  phone: '',
  extra_phones: [],
  address: '',
  email: '',
  fiscal_code: '',
  notes: '',
  customer_lat: null,
  customer_lng: null,
  place_id: '',
};

const formatDate = (dateString, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('it-IT', options);
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
}).format(amount || 0);

const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const mergeCustomerIntoList = (customers, updatedCustomer) => {
  const safeCustomers = ensureArray(customers);
  const exists = safeCustomers.some((customer) => customer.customer_id === updatedCustomer.customer_id);
  if (!exists) return [updatedCustomer, ...safeCustomers];
  return safeCustomers.map((customer) => (
    customer.customer_id === updatedCustomer.customer_id ? { ...customer, ...updatedCustomer } : customer
  ));
};

const buildInitialCustomerStats = (customer) => ({
  customer,
  stats: {
    total_deliveries: 0,
    completed_deliveries: 0,
    cancelled_deliveries: 0,
    active_deliveries: 0,
    pending_deliveries: 0,
    total_spent: 0,
    average_order_value: 0,
    completion_rate: 0,
    cancellation_rate: 0,
    last_delivery: null,
    last_order_at: null,
    delivered_this_month: 0,
    preferred_payment_method: null,
    average_days_between_orders: null,
    payment_breakdown: {
      cash: { count: 0, total: 0 },
      pos: { count: 0, total: 0 },
      other: { count: 0, total: 0 },
    },
    verified_address: customer?.customer_lat != null && customer?.customer_lng != null,
  },
  recent_deliveries: [],
});

const CustomerMetricCard = ({ icon: Icon, label, value, hint, accent = 'text-primary' }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-2xl bg-primary/10 p-2.5">
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerStats, setCustomerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === 'true') {
      setDialogOpen(true);
      window.history.replaceState({}, '', '/customers');
    }
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers`, { withCredentials: true });
      setCustomers(ensureArray(response.data));
    } catch {
      toast.error('Errore nel caricamento clienti');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerStats = async (customerId, customerSnapshot = null) => {
    setLoadingStats(true);
    if (customerSnapshot) {
      setCustomerStats(buildInitialCustomerStats(customerSnapshot));
    }
    try {
      const response = await axios.get(`${API}/customers/${customerId}/stats`, { withCredentials: true });
      const nextStats = ensureObject(response.data);
      setCustomerStats(nextStats);
      setSelectedCustomer(nextStats.customer || customerSnapshot || null);
    } catch {
      toast.error('Errore nel caricamento profilo cliente');
    } finally {
      setLoadingStats(false);
    }
  };

  const resetForm = () => {
    setEditingCustomer(null);
    setFormData(emptyForm);
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      extra_phones: ensureArray(customer.extra_phones),
      address: customer.address || '',
      email: customer.email || '',
      fiscal_code: customer.fiscal_code || '',
      notes: customer.notes || '',
      customer_lat: customer.customer_lat ?? null,
      customer_lng: customer.customer_lng ?? null,
      place_id: customer.place_id || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = editingCustomer
        ? await axios.put(`${API}/customers/${editingCustomer.customer_id}`, formData, { withCredentials: true })
        : await axios.post(`${API}/customers`, formData, { withCredentials: true });

      const updatedCustomer = response.data;
      setCustomers((prev) => mergeCustomerIntoList(prev, updatedCustomer));
      if (selectedCustomer?.customer_id === updatedCustomer.customer_id) {
        setSelectedCustomer(updatedCustomer);
        await fetchCustomerStats(updatedCustomer.customer_id, updatedCustomer);
      }
      toast.success(editingCustomer ? 'Cliente aggiornato' : 'Cliente creato');
      setDialogOpen(false);
      resetForm();
      if (!editingCustomer) fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  const handleDelete = async (customerId) => {
    if (!window.confirm('Eliminare questo cliente?')) return;
    try {
      await axios.delete(`${API}/customers/${customerId}`, { withCredentials: true });
      setCustomers((prev) => ensureArray(prev).filter((customer) => customer.customer_id !== customerId));
      if (selectedCustomer?.customer_id === customerId) {
        setSelectedCustomer(null);
        setCustomerStats(null);
      }
      toast.success('Cliente eliminato');
    } catch {
      toast.error('Errore eliminazione');
    }
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    fetchCustomerStats(customer.customer_id, customer);
  };

  const filteredCustomers = useMemo(() => ensureArray(customers).filter((customer) => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    if (!normalizedTerm) return true;
    return [customer.name, customer.phone, customer.address, customer.email, customer.fiscal_code]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedTerm));
  }), [customers, searchTerm]);

  if (loading) {
    return (
      <Layout title="Clienti">
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <div className="spinner"></div>
          <p className="text-sm text-muted-foreground">Caricamento anagrafica clienti…</p>
        </div>
      </Layout>
    );
  }

  const stats = customerStats?.stats;
  const customer = customerStats?.customer || selectedCustomer;
  const recentDeliveries = ensureArray(customerStats?.recent_deliveries);
  const preferredPayment = stats?.preferred_payment_method ? paymentLabels[stats.preferred_payment_method] : 'Non disponibile';
  const averageDays = stats?.average_days_between_orders ? `${stats.average_days_between_orders} giorni` : 'Non disponibile';
  const customerAge = calculateAge(customer?.birth_date);
  const addressLink = customer?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`
    : null;

  if (selectedCustomer) {
    if (loadingStats && !customerStats) {
      return (
        <Layout title="Clienti">
          <div className="space-y-6" data-testid="customer-detail-loading">
            <Button
              variant="ghost"
              onClick={() => { setSelectedCustomer(null); setCustomerStats(null); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla lista
            </Button>
            <Card>
              <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="spinner"></div>
                <div>
                  <p className="font-medium text-foreground">Sto aprendo il profilo cliente</p>
                  <p className="text-sm text-muted-foreground">Recupero storico, statistiche e dettagli personali…</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Layout>
      );
    }

    return (
      <Layout title="Clienti">
        <div className="space-y-6" data-testid="customer-detail">
          <Button
            variant="ghost"
            onClick={() => { setSelectedCustomer(null); setCustomerStats(null); }}
            className="w-fit text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla lista
          </Button>

          <Card className="overflow-hidden border-primary/20">
            <CardContent className="p-0">
              <div className="bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-6 md:p-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h1 className="text-2xl font-bold text-foreground md:text-3xl">{customer.name}</h1>
                          {stats?.verified_address && (
                            <Badge variant="secondary" className="gap-1.5">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Indirizzo verificato
                            </Badge>
                          )}
                          {customer.email && <Badge variant="outline">Email presente</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Cliente dal {formatDate(customer.created_at)} · Ultimo ordine {formatDateTime(stats?.last_order_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => openEditDialog(customer)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Modifica profilo
                        </Button>
                        <Button asChild className="btn-primary">
                          <a href={`tel:${customer.phone}`}>
                            <Phone className="mr-2 h-4 w-4" />
                            Chiama cliente
                          </a>
                        </Button>
                        {customer.email && (
                          <Button asChild variant="outline">
                            <a href={`mailto:${customer.email}`}>
                              <Mail className="mr-2 h-4 w-4" />
                              Invia email
                            </a>
                          </Button>
                        )}
                        {addressLink && (
                          <Button asChild variant="outline">
                            <a href={addressLink} target="_blank" rel="noopener noreferrer">
                              <Navigation className="mr-2 h-4 w-4" />
                              Apri mappa
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:w-[320px]">
                    <div className="rounded-2xl border bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Tasso completamento</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{stats?.completion_rate || 0}%</p>
                      <p className="text-xs text-muted-foreground">{stats?.completed_deliveries || 0} consegne concluse</p>
                    </div>
                    <div className="rounded-2xl border bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Spesa media</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(stats?.average_order_value)}</p>
                      <p className="text-xs text-muted-foreground">Ticket medio degli ordini conclusi</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CustomerMetricCard
              icon={Package}
              label="Ordini totali"
              value={stats?.total_deliveries || 0}
              hint={`${stats?.pending_deliveries || 0} in attesa · ${stats?.active_deliveries || 0} attivi`}
              accent="text-primary"
            />
            <CustomerMetricCard
              icon={CheckCircle2}
              label="Consegne completate"
              value={stats?.completed_deliveries || 0}
              hint={`${stats?.delivered_this_month || 0} completate questo mese`}
              accent="text-emerald-500"
            />
            <CustomerMetricCard
              icon={XCircle}
              label="Consegne annullate"
              value={stats?.cancelled_deliveries || 0}
              hint={`${stats?.cancellation_rate || 0}% di annullamento`}
              accent="text-rose-500"
            />
            <CustomerMetricCard
              icon={Euro}
              label="Totale speso"
              value={formatCurrency(stats?.total_spent)}
              hint="Valore complessivo delle consegne concluse"
              accent="text-amber-500"
            />
            <CustomerMetricCard
              icon={Clock}
              label="Ultima consegna"
              value={stats?.last_delivery ? formatDate(stats.last_delivery) : '-'}
              hint={stats?.last_delivery ? formatDateTime(stats.last_delivery) : 'Ancora nessuna consegna conclusa'}
              accent="text-sky-500"
            />
            <CustomerMetricCard
              icon={TrendingUp}
              label="Frequenza media"
              value={averageDays}
              hint="Intervallo medio tra due consegne concluse"
              accent="text-violet-500"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Profilo personale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-foreground">Contatti</h3>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Telefono principale</p>
                        <a href={`tel:${customer.phone}`} className="font-medium text-foreground hover:text-primary">{customer.phone}</a>
                      </div>
                      {ensureArray(customer.extra_phones).map((phone, i) => (
                        <div key={i}>
                          <p className="text-muted-foreground">Telefono aggiuntivo {i + 1}</p>
                          <a href={`tel:${phone}`} className="font-medium text-foreground hover:text-primary">{phone}</a>
                        </div>
                      ))}
                      <div>
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-medium text-foreground">{customer.email || 'Non inserita'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Indirizzo</p>
                        <p className="font-medium text-foreground">{customer.address || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-foreground">Dati personali</h3>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Codice fiscale</p>
                        <p className="font-medium text-foreground">{customer.fiscal_code || 'Non inserito'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Creazione profilo</p>
                        <p className="font-medium text-foreground">{formatDateTime(customer.created_at)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-foreground">Note operative</h3>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">
                    {customer.notes || 'Nessuna nota salvata per questo cliente.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Abitudini di consegna</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Completamento</span>
                      <span className="font-medium text-foreground">{stats?.completion_rate || 0}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(stats?.completion_rate || 0, 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Annullamenti</span>
                      <span className="font-medium text-foreground">{stats?.cancellation_rate || 0}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(stats?.cancellation_rate || 0, 100)}%` }} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento preferito</p>
                      <p className="mt-2 font-semibold text-foreground">{preferredPayment}</p>
                    </div>
                    <div className="rounded-2xl border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ordini in corso</p>
                      <p className="mt-2 font-semibold text-foreground">{stats?.active_deliveries || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Incassi e pagamenti</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {['cash', 'pos', 'other'].map((method) => (
                    <div key={method} className="flex items-center justify-between rounded-2xl border p-3 text-sm">
                      <div className="flex items-center gap-2">
                        {method === 'cash' ? <Wallet className="h-4 w-4 text-amber-500" /> : <Activity className="h-4 w-4 text-sky-500" />}
                        <div>
                          <p className="font-medium text-foreground">{paymentLabels[method]}</p>
                          <p className="text-xs text-muted-foreground">{stats?.payment_breakdown?.[method]?.count || 0} ordini</p>
                        </div>
                      </div>
                      <span className="font-semibold text-foreground">{formatCurrency(stats?.payment_breakdown?.[method]?.total)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Storico consegne</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[420px] pr-3">
                {recentDeliveries.length === 0 ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed text-center">
                    <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="font-medium text-foreground">Nessuna consegna ancora registrata</p>
                    <p className="text-sm text-muted-foreground">Quando creerai il primo ordine, lo storico apparirà qui.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentDeliveries.map((delivery) => (
                      <div key={delivery.delivery_id} className="rounded-2xl border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={`status-${delivery.status}`}>{statusLabels[delivery.status] || delivery.status}</Badge>
                              <Badge variant="outline">{paymentLabels[delivery.payment_method] || 'Pagamento non specificato'}</Badge>
                              {delivery.priority && delivery.priority !== 'normal' && <Badge variant="secondary">Priorità {delivery.priority}</Badge>}
                            </div>
                            <p className="font-medium text-foreground">{delivery.items || delivery.notes || 'Consegna farmacia'}</p>
                            <p className="text-sm text-muted-foreground">
                              Creata il {formatDateTime(delivery.created_at)}
                              {delivery.actual_delivery ? ` · Consegnata il ${formatDateTime(delivery.actual_delivery)}` : ''}
                            </p>
                            {delivery.notes && <p className="text-sm text-muted-foreground">Note: {delivery.notes}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-foreground">{formatCurrency(delivery.amount)}</p>
                            {delivery.change_due != null && (
                              <p className="text-xs text-muted-foreground">Resto {formatCurrency(delivery.change_due)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Clienti">
      <div className="space-y-6" data-testid="customers-page">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Anagrafica clienti</h1>
            <p className="text-muted-foreground">{ensureArray(customers).length} profili salvati con recapiti e storico ordini</p>
          </div>
          <Button onClick={openNewDialog} className="btn-primary" data-testid="add-customer-btn">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo cliente
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome, telefono, email o indirizzo…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10"
              data-testid="search-customers"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Profili completi e pronti per la consegna
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <User className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium text-foreground">
                {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente registrato'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchTerm ? 'Prova con un altro nome, telefono o email.' : 'Crea il primo profilo per velocizzare le prossime consegne.'}
              </p>
              {!searchTerm && (
                <Button onClick={openNewDialog} variant="outline" className="mt-4">
                  Aggiungi il primo cliente
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCustomers.map((customer, index) => {
              const hasVerifiedAddress = customer.customer_lat != null && customer.customer_lng != null;
              const extraPhones = ensureArray(customer.extra_phones);
              return (
                <Card
                  key={customer.customer_id}
                  className={`cursor-pointer border-border/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm animate-slide-up stagger-${(index % 5) + 1}`}
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{customer.name}</h3>
                          <p className="text-xs text-muted-foreground">{customer.email || 'Email non inserita'}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => { event.stopPropagation(); openEditDialog(customer); }}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          data-testid={`edit-customer-${customer.customer_id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => { event.stopPropagation(); handleDelete(customer.customer_id); }}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`delete-customer-${customer.customer_id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {hasVerifiedAddress && <Badge variant="secondary">Indirizzo verificato</Badge>}
                      {customer.notes && <Badge variant="outline">Note presenti</Badge>}
                      {extraPhones.length > 0 && <Badge variant="outline">+{extraPhones.length} tel.</Badge>}
                    </div>

                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <span>{customer.phone}</span>
                      </div>
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span className="line-clamp-2">{customer.address}</span>
                      </div>
                      {customer.fiscal_code && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CreditCard className="h-4 w-4" />
                          <span className="truncate uppercase">{customer.fiscal_code}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
                      <span className="text-muted-foreground">Apri profilo completo</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Modifica cliente' : 'Nuovo cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="form-group sm:col-span-2">
                    <Label htmlFor="name">Nome completo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                      placeholder="Mario Rossi"
                      required
                      data-testid="customer-name-input"
                    />
                  </div>
                  <div className="form-group">
                    <Label htmlFor="phone">Telefono *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                      placeholder="+39 333 1234567"
                      required
                      data-testid="customer-phone-input"
                    />
                  </div>
                  <div className="form-group">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="mario@email.com"
                      data-testid="customer-email-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <AddressAutocomplete
                    id="address"
                    label="Indirizzo"
                    required
                    value={formData.address}
                    onChange={(value) => setFormData({ ...formData, address: value, customer_lat: null, customer_lng: null, place_id: '' })}
                    onAddressSelect={(selection) => setFormData({
                      ...formData,
                      address: selection.address,
                      customer_lat: selection.lat,
                      customer_lng: selection.lng,
                      place_id: selection.placeId || '',
                    })}
                    placeholder="Via Rossi 119, 80040 Volla (NA)"
                  />
                  {formData.customer_lat && formData.customer_lng && (
                    <p className="text-xs text-emerald-600">Indirizzo verificato sulla mappa</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="form-group">
                    <Label htmlFor="fiscal_code">Codice fiscale</Label>
                    <Input
                      id="fiscal_code"
                      value={formData.fiscal_code}
                      onChange={(event) => setFormData({ ...formData, fiscal_code: event.target.value.toUpperCase() })}
                      placeholder="RSSMRA80A01H501U"
                      className="uppercase"
                      data-testid="customer-fiscal-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <Label>Telefoni aggiuntivi</Label>
                  <div className="space-y-2 mt-1">
                    {ensureArray(formData.extra_phones).map((phone, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          type="tel"
                          value={phone}
                          onChange={(e) => {
                            const phones = [...ensureArray(formData.extra_phones)];
                            phones[i] = e.target.value;
                            setFormData({ ...formData, extra_phones: phones });
                          }}
                          placeholder={`Telefono ${i + 2}`}
                          data-testid={`customer-extra-phone-${i}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const phones = [...ensureArray(formData.extra_phones)];
                            phones.splice(i, 1);
                            setFormData({ ...formData, extra_phones: phones });
                          }}
                          className="h-10 w-10 text-muted-foreground hover:text-destructive flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData({ ...formData, extra_phones: [...ensureArray(formData.extra_phones), ''] })}
                      className="gap-2 text-muted-foreground"
                      data-testid="add-extra-phone-btn"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Aggiungi numero
                    </Button>
                  </div>
                </div>

                <div className="form-group">
                  <Label htmlFor="notes">Note</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                    placeholder="Allergie, citofono, preferenze di consegna…"
                    data-testid="customer-notes-input"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" className="btn-primary" data-testid="save-customer-btn">
                  {editingCustomer ? 'Salva modifiche' : 'Crea cliente'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

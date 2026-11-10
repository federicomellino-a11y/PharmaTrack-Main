import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { chiavi, letture } from '@/lib/api';
import { API } from '@/lib/config';
import { useCustomersQuery } from '@/hooks/queries';
import { ListSkeleton } from '../../components/Skeletons';
import ClienteDialog from '../../components/customers/ClienteDialog';
import AnalisiCliente from '../../components/customers/AnalisiCliente';
import ProGate from '../../components/ProGate';
import CartaCliente from '../../components/customers/CartaCliente';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import { Dialog } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Search, Plus, Pencil, Phone, User, Mail, Package, Clock, Euro, ArrowLeft, CheckCircle2, XCircle, Navigation, ShieldCheck, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray, ensureObject } from '@/lib/collections';
import { confirmAction } from '../../components/ConfirmDialog';


import { formatCurrency, formatDate, formatDateTimeFull } from '@/lib/format';
import CustomerMetricCard from '../../components/customers/CustomerMetricCard';
import {
  buildInitialCustomerStats,
  calculateAge,
  emptyForm,
  mergeCustomerIntoList,
  paymentLabels,
  statusLabels,
} from '@/lib/customers';

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: customers = [], isLoading: loading } = useCustomersQuery();
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerStats, setCustomerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const setCustomers = (updater) =>
    queryClient.setQueryData(['customers'], (prev) =>
      typeof updater === 'function' ? updater(ensureArray(prev)) : updater);
  const fetchCustomers = () => queryClient.invalidateQueries({ queryKey: ['customers'] });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === 'true') {
      setDialogOpen(true);
      window.history.replaceState({}, '', '/customers');
    }
  }, []);

  const fetchCustomerStats = async (customerId, customerSnapshot = null) => {
    setLoadingStats(true);
    if (customerSnapshot) {
      setCustomerStats(buildInitialCustomerStats(customerSnapshot));
    }
    try {
      const response = await queryClient.fetchQuery({
        queryKey: chiavi.statsCliente(customerId),
        queryFn: letture.statsCliente(customerId),
      });
      const nextStats = ensureObject(response);
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
    if (!(await confirmAction({ title: 'Eliminare questo cliente?', description: "Il cliente e le sue consegne passate restano nello storico.", confirmLabel: 'Elimina', destructive: true }))) return;
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

  const mapLinkFor = (customer) => (
    customer.customer_lat != null && customer.customer_lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${customer.customer_lat},${customer.customer_lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address || customer.name || '')}`
  );

  const deliveryLinkFor = (customer) => {
    const params = new URLSearchParams({ new: 'true' });
    if (customer.name) params.set('customer_name', customer.name);
    if (customer.phone) params.set('customer_phone', customer.phone);
    if (customer.address) params.set('customer_address', customer.address);
    return `/deliveries?${params.toString()}`;
  };

  const filteredCustomers = useMemo(() => ensureArray(customers).filter((customer) => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    if (!normalizedTerm) return true;
    return [customer.name, customer.phone, customer.address, customer.email, customer.fiscal_code]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalizedTerm));
  }), [customers, searchTerm]);

  // Dialog condiviso: serve sia nella lista sia nel profilo cliente
  const customerDialog = (
    <ClienteDialog
      {...{
        dialogOpen,
        editingCustomer,
        formData,
        handleSubmit,
        setDialogOpen,
        setFormData,
      }}
    />
  );

  if (loading) {
    return (
      <Layout title="Clienti">
        <div className="p-4"><ListSkeleton rows={8} /></div>
      </Layout>
    );
  }

  const stats = customerStats?.stats;
  const customer = customerStats?.customer || selectedCustomer;
  const recentDeliveries = ensureArray(customerStats?.recent_deliveries);
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
          {customerDialog}
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
                          Cliente dal {formatDate(customer.created_at)} · Ultimo ordine {formatDateTimeFull(stats?.last_order_at)}
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
                        <Button asChild variant="outline">
                          <Link to={deliveryLinkFor(customer)}>
                            <Package className="mr-2 h-4 w-4" />
                            Nuova consegna
                          </Link>
                        </Button>
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
              hint={stats?.last_delivery ? formatDateTimeFull(stats.last_delivery) : 'Ancora nessuna consegna conclusa'}
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

          <ProGate funzione="analisi_cliente" compatto>
            <AnalisiCliente analisi={customerStats?.analisi} />
          </ProGate>

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
                              Creata il {formatDateTimeFull(delivery.created_at)}
                              {delivery.actual_delivery ? ` · Consegnata il ${formatDateTimeFull(delivery.actual_delivery)}` : ''}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openNewDialog} className="btn-primary" data-testid="add-customer-btn">
              <Plus className="mr-2 h-4 w-4" />
              Nuovo cliente
            </Button>
          </div>
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
            {filteredCustomers.map((customer, index) => (
              <CartaCliente
                key={customer.customer_id}
                customer={customer}
                indice={index}
                onApri={handleSelectCustomer}
                onModifica={openEditDialog}
                onElimina={handleDelete}
                linkMappa={mapLinkFor}
                linkConsegna={deliveryLinkFor}
              />
            ))}
          </div>
        )}

{customerDialog}
      </div>
    </Layout>
  );
}

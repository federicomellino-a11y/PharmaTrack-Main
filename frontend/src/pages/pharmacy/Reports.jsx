import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { Button } from '../../components/ui/button';
import {
  Euro, Package, TrendingUp, Truck, CreditCard, Banknote, Trophy, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray, ensureObject } from '@/lib/collections';

const COLORS = ['hsl(173,80%,40%)', 'hsl(199,89%,48%)', 'hsl(280,65%,60%)', 'hsl(45,93%,47%)', 'hsl(0,72%,51%)'];
const periodLabels = { week: 'Settimana', month: 'Mese', year: 'Anno' };

const EmptyState = ({ title, hint }) => (
  <div className="py-10 text-center">
    <p className="font-medium text-muted-foreground">{title}</p>
    <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
  </div>
);

const exportCSV = (report, period) => {
  if (!report) { toast.error('Nessun dato da esportare'); return; }
  const rows = [];
  const periodLabel = { week: 'Settimana', month: 'Mese', year: 'Anno' }[period] || period;

  rows.push(['PharmaTrack - Report Consegne']);
  rows.push([`Periodo: ${periodLabel}`]);
  rows.push([`Generato il: ${new Date().toLocaleString('it-IT')}`]);
  rows.push([]);

  rows.push(['RIEPILOGO']);
  rows.push(['Fatturato totale', `€${(report.total_revenue || 0).toFixed(2)}`]);
  rows.push(['Totale consegne', report.total_deliveries || 0]);
  rows.push(['Valore medio ordine', `€${(report.avg_order_value || 0).toFixed(2)}`]);
  rows.push(['Contanti', report.payment_breakdown?.cash || 0]);
  rows.push(['POS', report.payment_breakdown?.pos || 0]);
  rows.push([]);

  const topCustomers = ensureArray(report.top_customers);
  if (topCustomers.length > 0) {
    rows.push(['TOP CLIENTI']);
    rows.push(['Nome', 'Consegne', 'Fatturato']);
    topCustomers.forEach(c => rows.push([c.name, c.deliveries, `€${(c.revenue || 0).toFixed(2)}`]));
    rows.push([]);
  }

  const topDrivers = ensureArray(report.top_drivers);
  if (topDrivers.length > 0) {
    rows.push(['PERFORMANCE FATTORINI']);
    rows.push(['Nome', 'Consegne', 'Fatturato gestito']);
    topDrivers.forEach(d => rows.push([d.name, d.deliveries, `€${(d.revenue || 0).toFixed(2)}`]));
  }

  const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pharmatrack-report-${period}-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success('CSV esportato con successo');
};

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, [period]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/reports?period=${period}`, { withCredentials: true });
      setReport(ensureObject(response.data));
    } catch {
      toast.error('Errore nel caricamento report');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount || 0);

  if (loading) {
    return (
      <Layout title="Report">
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      </Layout>
    );
  }

  const paymentData = [
    { name: 'Contanti', value: report?.payment_breakdown?.cash || 0, color: 'hsl(142,76%,36%)' },
    { name: 'POS', value: report?.payment_breakdown?.pos || 0, color: 'hsl(199,89%,48%)' },
  ];

  const topCustomers = ensureArray(report?.top_customers);
  const topDrivers = ensureArray(report?.top_drivers);

  return (
    <Layout title="Report">
      <div className="space-y-6" data-testid="reports-page">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Report & Statistiche</h1>
            <p className="text-muted-foreground">Analisi dettagliata delle performance</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => exportCSV(report, period)} className="gap-2">
              <Download className="w-4 h-4" />Esporta CSV
            </Button>
            <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              <TabsTrigger value="week">Settimana</TabsTrigger>
              <TabsTrigger value="month">Mese</TabsTrigger>
              <TabsTrigger value="year">Anno</TabsTrigger>
            </TabsList>
          </Tabs>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="stat-modern">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Fatturato</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(report?.total_revenue)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{periodLabels[period]}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Euro className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-modern">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Consegne</p>
                  <p className="text-2xl font-bold">{report?.total_deliveries || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">{periodLabels[period]}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-modern">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Media ordine</p>
                  <p className="text-2xl font-bold">{formatCurrency(report?.avg_order_value)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Per consegna</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-modern">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Contanti</p>
                  <p className="text-2xl font-bold">{report?.payment_breakdown?.cash || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">vs {report?.payment_breakdown?.pos || 0} POS</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="card-exclusive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Top Clienti per fatturato
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCustomers.length === 0 ? (
                <EmptyState title="Nessun dato disponibile" hint="Prova a cambiare periodo o attendi le prime consegne consegnate per vedere il fatturato." />
              ) : (
                <>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topCustomers} layout="vertical" margin={{ left: 16, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis
                          type="number"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickFormatter={(value) => `€${Math.round(value)}`}
                        />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={120}
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                          formatter={(value, name, item) => {
                            if (name === 'revenue') return [formatCurrency(value), 'Fatturato'];
                            return [value, 'Consegne'];
                          }}
                          labelFormatter={(label) => label}
                        />
                        <Bar dataKey="revenue" fill="hsl(173,80%,40%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Ogni barra rappresenta il fatturato totale. Nel tooltip trovi anche il numero di consegne per cliente.</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="card-exclusive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-500" />
                Metodi di pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentData.every((entry) => entry.value === 0) ? (
                <EmptyState title="Ancora nessun pagamento registrato" hint="Quando completi le prime consegne qui vedrai il mix tra contanti e POS." />
              ) : (
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={82}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {paymentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, 'Consegne']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="card-exclusive lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-purple-500" />
                Performance fattorini
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topDrivers.length === 0 ? (
                <EmptyState title="Nessun fattorino in classifica" hint="Le performance appariranno non appena ci saranno consegne consegnate nel periodo selezionato." />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {topDrivers.map((driver, index) => (
                    <div key={driver.driver_id} className="p-4 rounded-xl bg-secondary/30 text-center">
                      <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2 ${
                        index === 0 ? 'bg-amber-500/20 text-amber-500'
                          : index === 1 ? 'bg-zinc-400/20 text-zinc-400'
                            : index === 2 ? 'bg-orange-600/20 text-orange-600'
                              : 'bg-primary/10 text-primary'
                      }`}>
                        {index < 3 ? <Trophy className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                      </div>
                      <p className="font-semibold">{driver.name}</p>
                      <p className="text-2xl font-bold text-primary">{driver.deliveries}</p>
                      <p className="text-xs text-muted-foreground">consegne</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatCurrency(driver.revenue)}</p>
                      <p className="text-[11px] text-muted-foreground">fatturato gestito</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

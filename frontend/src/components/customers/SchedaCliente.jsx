import { ensureArray } from '@/lib/collections';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Activity, Wallet } from 'lucide-react';
import { formatCurrency, formatDateTimeFull } from '@/lib/format';
import { paymentLabels } from '@/lib/labels';

/* La scheda di un cliente: profilo, abitudini di consegna, incassi.

   Stava dentro il ramo `if (selectedCustomer)` di Customers.jsx, 122 righe di
   sola disposizione in mezzo alla logica della pagina.
*/
export default function SchedaCliente({ stats, customer, preferredPayment }) {
  return (
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
                        <p className="font-medium text-foreground">{formatDateTimeFull(customer.created_at)}</p>
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
  );
}

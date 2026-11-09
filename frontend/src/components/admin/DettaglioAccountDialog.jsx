import React from 'react';
import { AlertTriangle, Bell, Database, Package, Truck, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { STATUS_LABELS } from '@/lib/deliveryDisplay';
import { formatCurrency, formatDateTimeLong } from '@/lib/format';

/**
 * Il dettaglio di un account nella console: anagrafica, consegne recenti,
 * fattorini collegati, notifiche. Dati gia' caricati dalla pagina, qui si mostrano.
 */
export default function DettaglioAccountDialog({
  open,
  onOpenChange,
  utente,
  dettagli,
  consegneRecenti = [],
  fattorini = [],
  notifiche = [],
  caricamento = false,
}) {
  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{utente?.pharmacy_name || utente?.name || 'Dettagli account'}</DialogTitle>
        <DialogDescription>
          Vista completa di account, consegne recenti, fattorini collegati e notifiche salvate.
        </DialogDescription>
      </DialogHeader>

      {caricamento ? (
        <div className="py-16 flex items-center justify-center"><div className="spinner" /></div>
      ) : dettagli ? (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Clienti', value: dettagli.stats?.customers || 0, icon: Users },
              { label: 'Fattorini', value: dettagli.stats?.drivers || 0, icon: Truck },
              { label: 'Consegne', value: dettagli.stats?.deliveries || 0, icon: Package },
              { label: 'Sessioni', value: dettagli.stats?.sessions || 0, icon: Database },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-2xl font-black">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Anagrafica account</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p><span className="text-muted-foreground">Nome:</span> {utente?.name || '-'}</p>
                <p><span className="text-muted-foreground">Email:</span> {utente?.email || '-'}</p>
                <p><span className="text-muted-foreground">Telefono farmacia:</span> {utente?.pharmacy_phone || '-'}</p>
              </div>
              <div className="space-y-2">
                <p><span className="text-muted-foreground">Farmacia:</span> {utente?.pharmacy_name || '-'}</p>
                <p><span className="text-muted-foreground">Indirizzo:</span> {utente?.pharmacy_address || '-'}</p>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Stato:</span>
                  <Badge variant={(utente?.is_active ?? true) ? 'secondary' : 'destructive'}>
                    {(utente?.is_active ?? true) ? 'Attivo' : 'Disattivato'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid xl:grid-cols-[1.1fr_1fr] gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Consegne recenti</CardTitle>
                <CardDescription>Ultime operazioni associate alla farmacia selezionata.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {consegneRecenti.length ? consegneRecenti.map((delivery) => (
                  <div key={delivery.delivery_id} className="rounded-2xl border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-medium">{delivery.customer_name || 'Cliente non disponibile'}</p>
                      <Badge variant="outline">{STATUS_LABELS[delivery.status] || delivery.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{delivery.driver_name || 'Nessun fattorino'} · {delivery.payment_method?.toUpperCase() || '-'}</p>
                    <p className="text-sm font-semibold">{formatCurrency(delivery.amount)}</p>
                    <p className="text-xs text-muted-foreground">Creata il {formatDateTimeLong(delivery.created_at)}</p>
                  </div>
                )) : (
                  <div className="py-8 text-center text-muted-foreground">Nessuna consegna recente disponibile.</div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Fattorini collegati</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fattorini.length ? fattorini.map((driver) => (
                    <div key={driver.driver_id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{driver.name}</p>
                        <Badge variant={(driver.is_active ?? true) ? 'secondary' : 'destructive'}>
                          {(driver.is_active ?? true) ? 'Attivo' : 'Disattivato'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{driver.email || driver.phone || '-'}</p>
                      <p className="text-xs text-muted-foreground mt-1">Ultima posizione: {formatDateTimeLong(driver.last_location_update)}</p>
                    </div>
                  )) : (
                    <div className="py-8 text-center text-muted-foreground">Nessun fattorino collegato.</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notifiche recenti</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {notifiche.length ? notifiche.map((notification) => (
                    <div key={notification.notification_id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{notification.title}</p>
                          <p className="text-sm text-muted-foreground mt-1">{notification.message || notification.body || 'Nessun contenuto disponibile'}</p>
                        </div>
                        <Bell className={`w-4 h-4 ${notification.is_read ? 'text-muted-foreground' : 'text-primary'}`} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{formatDateTimeLong(notification.created_at)}</p>
                    </div>
                  )) : (
                    <div className="py-8 text-center text-muted-foreground">Nessuna notifica recente.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          Impossibile caricare i dettagli dell'account selezionato.
        </div>
      )}
    </DialogContent>
  </Dialog>
  );
}

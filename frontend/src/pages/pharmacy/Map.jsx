import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPinned, AlertTriangle, ArrowRight } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import MappaClienti from '../../components/customers/MappaClienti';
import { useCustomersQuery } from '@/hooks/queries';
import { useAuth } from '../../contexts/AuthContext';
import { ensureArray } from '@/lib/collections';
import { ListSkeleton } from '../../components/Skeletons';

/* La sezione della mappa.
   Non e' una funzione nuova: e' la mappa che stava in Home, spostata dove la
   si cerca. I dati sono gli stessi clienti dell'anagrafica e la posizione si
   salva sul cliente come prima. */

export default function MapPage() {
  const { user } = useAuth();
  const { data: customers = [], isLoading } = useCustomersQuery();
  const clienti = ensureArray(customers);

  const senzaIndirizzo = useMemo(
    () => clienti.filter((cliente) => !cliente.address || !String(cliente.address).trim()),
    [clienti]
  );

  return (
    <Layout title="Mappa clienti">
      <div className="space-y-5 animate-fade-in-up" data-testid="mappa-page">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <MapPinned className="h-5 w-5 text-primary" />
              Mappa clienti
            </h1>
            <p className="text-sm text-muted-foreground">
              {clienti.length} clienti in anagrafica · la farmacia è il punto giallo
            </p>
          </div>
          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Vai all'anagrafica <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="p-4"><ListSkeleton rows={6} /></div>
        ) : (
          <MappaClienti customers={clienti} user={user} altezza="h-[62vh] min-h-[380px]" />
        )}

        {senzaIndirizzo.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {senzaIndirizzo.length} clienti senza indirizzo
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Senza indirizzo non compaiono sulla mappa e non possono ricevere consegne.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {senzaIndirizzo.slice(0, 12).map((cliente) => (
                  <Link
                    key={cliente.customer_id}
                    to={`/customers?customer=${cliente.customer_id}`}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    {cliente.name}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

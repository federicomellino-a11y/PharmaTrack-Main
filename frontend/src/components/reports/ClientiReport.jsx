import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Trophy, Users } from 'lucide-react';
import { ensureArray } from '@/lib/collections';
import { formatCurrency } from '@/lib/format';
import { CardConTitolo, TestataScheda, Vuoto, quota } from './PezziReport';
import NumeriClienti from './NumeriClienti';
import PazientiRicorrenti from './PazientiRicorrenti';

/* Chi compra, chi torna, chi si è fermato.

   Due cose che la farmacia usa davvero: i pazienti che pesano di più sul
   fatturato e quelli che ordinavano e hanno smesso. Il resto delle liste
   (ricorrenze scadute, in arrivo) è in PazientiRicorrenti, senza telefoni e
   senza esiti da compilare.
*/

export default function ClientiReport({ dati, etichettaPeriodo }) {
  const top = ensureArray(dati?.top_customers);
  const totalePeriodo = Number(dati?.summary?.total_revenue || 0);
  const pesoTop = top.reduce((somma, cliente) => somma + Number(cliente.revenue || 0), 0);

  return (
    <section className="space-y-6" data-testid="scheda-clienti">
      <TestataScheda
        icona={Users}
        titolo={`Chi compra da te · ${etichettaPeriodo}`}
        descrizione="Quanti pazienti hanno ordinato, quanto valgono i primi cinque e chi ha smesso di farsi vivo."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <NumeriClienti clienti={dati?.clienti} />

        <CardConTitolo
          icona={Trophy}
          titolo="I pazienti che pesano di più"
          sotto="Primi cinque per numero di consegne nel periodo"
          className="lg:col-span-2"
        >
          {top.length === 0 ? (
            <Vuoto titolo="Nessun dato disponibile" aiuto="Attendi le prime consegne completate." />
          ) : (
            <>
              <div className="h-64 w-full" data-testid="top-customers-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} tickFormatter={(v) => `€${Math.round(v)}`} />
                    <YAxis dataKey="name" type="category" width={110} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value, name, item) => [
                        name === 'revenue' ? formatCurrency(value) : value,
                        name === 'revenue' ? `Fatturato · ${item.payload.deliveries} consegne` : 'Consegne',
                      ]}
                    />
                    <Bar dataKey="revenue" fill="hsl(173,80%,40%)" radius={[0, 4, 4, 0]} barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Insieme valgono {formatCurrency(pesoTop)}
                {totalePeriodo > 0 && <> · {quota(pesoTop, totalePeriodo)}% del fatturato del periodo</>}.
              </p>
            </>
          )}
        </CardConTitolo>
      </div>

      <PazientiRicorrenti />
    </section>
  );
}

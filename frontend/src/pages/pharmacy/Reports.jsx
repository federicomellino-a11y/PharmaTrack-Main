import React, { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ListSkeleton } from '../../components/Skeletons';
import ProGate from '../../components/ProGate';
import {
  LayoutDashboard, Printer, Trophy, Truck, Users, Wallet,
} from 'lucide-react';
import { useAnalyticsQuery } from '@/hooks/queries';
import PanoramicaReport from '../../components/reports/PanoramicaReport';
import IncassiReport from '../../components/reports/IncassiReport';
import ClientiReport from '../../components/reports/ClientiReport';
import ConsegneReport from '../../components/reports/ConsegneReport';
import SquadraReport from '../../components/reports/SquadraReport';

/* Il Report, diviso in cinque schede.

   Perché: prima era una colonna unica di card, e per arrivare ai tempi di
   consegna si scorrevano due schermate. Chi paga il Professional apre questa
   pagina per rispondere a una domanda precisa ("quanto ho incassato", "chi
   non ordina più", "quanto ci mette il giro"), quindi ogni scheda risponde a
   una sola di quelle domande e la prima dice solo se il periodo va meglio o
   peggio. Il periodo scelto vale per tutte le schede: si sceglie una volta.
*/

const periodLabels = { week: 'Settimana', month: 'Mese', quarter: 'Trimestre', year: 'Anno' };

const SCHEDE = [
  { id: 'panoramica', nome: 'Panoramica', icona: LayoutDashboard, Scheda: PanoramicaReport },
  { id: 'incassi', nome: 'Incassi', icona: Wallet, Scheda: IncassiReport },
  { id: 'clienti', nome: 'Clienti', icona: Users, Scheda: ClientiReport },
  { id: 'consegne', nome: 'Consegne', icona: Truck, Scheda: ConsegneReport },
  { id: 'squadra', nome: 'Squadra', icona: Trophy, Scheda: SquadraReport },
];

const intervallo = (giorni) => {
  if (!giorni) return '';
  const fine = new Date();
  const inizio = new Date(fine.getTime() - (Number(giorni) - 1) * 86400000);
  const breve = { day: 'numeric', month: 'short' };
  return `${inizio.toLocaleDateString('it-IT', breve)} – ${fine.toLocaleDateString('it-IT', { ...breve, year: 'numeric' })}`;
};

export default function ReportsPage() {
  const [period, setPeriod] = useState('month');
  const [scheda, setScheda] = useState('panoramica');
  const [stampaTutto, setStampaTutto] = useState(false);
  const { data, isLoading, isError, error, dataUpdatedAt, refetch } = useAnalyticsQuery(period);

  // Stampa / PDF: si stampano tutte le schede in fila, non solo quella aperta.
  useEffect(() => {
    if (!stampaTutto) return undefined;
    const dopo = () => setStampaTutto(false);
    window.addEventListener('afterprint', dopo);
    const timer = setTimeout(() => window.print(), 200);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', dopo);
    };
  }, [stampaTutto]);

  if (isLoading) {
    return (
      <Layout title="Report">
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary/40" />
            ))}
          </div>
          <ListSkeleton rows={6} />
        </div>
      </Layout>
    );
  }

  const bloccato = isError && error?.response?.status === 402;

  if (bloccato) {
    return (
      <Layout title="Report">
        <div className="space-y-4 p-4" data-testid="reports-page">
          <ProGate funzione="report_avanzati" />
        </div>
      </Layout>
    );
  }

  if (isError || !data) {
    return (
      <Layout title="Report">
        <div className="p-4" data-testid="reports-page">
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="font-medium">Non riesco a caricare i report</p>
            <p className="mt-1 text-sm text-muted-foreground">Riprova tra qualche istante: i dati restano.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Riprova</Button>
          </div>
        </div>
      </Layout>
    );
  }

  const etichetta = periodLabels[period] || 'Periodo';
  const aggiornato = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null;
  const attiva = SCHEDE.find((voce) => voce.id === scheda) || SCHEDE[0];
  const SchedaAttiva = attiva.Scheda;

  return (
    <Layout title="Report">
      <div className="space-y-5" data-testid="reports-page">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Report</h1>
            <p className="text-sm text-muted-foreground">
              {intervallo(data.days)}
              {aggiornato && <> · aggiornato alle {aggiornato}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Tabs value={period} onValueChange={setPeriod}>
              <TabsList data-testid="period-tabs">
                <TabsTrigger value="week">Settimana</TabsTrigger>
                <TabsTrigger value="month">Mese</TabsTrigger>
                <TabsTrigger value="quarter">Trimestre</TabsTrigger>
                <TabsTrigger value="year">Anno</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStampaTutto(true)}
              className="gap-2"
              data-testid="print-report-btn"
              title="Stampa o salva come PDF tutte le schede: nel dialogo di stampa scegli 'Salva come PDF'"
            >
              <Printer className="h-4 w-4" />Stampa / PDF
            </Button>
          </div>
        </div>

        <Tabs value={scheda} onValueChange={setScheda} className="print:hidden">
          {/* Sul telefono le cinque schede stanno su due righe: una barra che
              scorre in orizzontale nasconde le ultime due, e chi apre il report
              dal banco non le trova. */}
          <TabsList
            className="grid h-auto w-full grid-cols-3 gap-1 p-1 sm:inline-flex sm:h-9 sm:w-auto sm:justify-start sm:gap-0"
            data-testid="report-tabs"
          >
            {SCHEDE.map((voce) => {
              const Icona = voce.icona;
              return (
                <TabsTrigger key={voce.id} value={voce.id} className="gap-1.5 px-2 py-1.5 text-[13px] sm:px-3 sm:text-sm">
                  <Icona className="hidden h-4 w-4 sm:block" />
                  <span className="whitespace-nowrap">{voce.nome}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {stampaTutto ? (
          <div className="space-y-10">
            {SCHEDE.map((voce) => {
              const Scheda = voce.Scheda;
              return (
                <div key={voce.id} className="space-y-5">
                  <h2 className="border-b border-border pb-2 text-lg font-bold">{voce.nome}</h2>
                  <Scheda dati={data} etichettaPeriodo={etichetta} />
                </div>
              );
            })}
          </div>
        ) : (
          <SchedaAttiva dati={data} etichettaPeriodo={etichetta} />
        )}
      </div>
    </Layout>
  );
}

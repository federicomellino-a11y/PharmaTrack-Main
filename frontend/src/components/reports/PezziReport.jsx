import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

/* I pezzi che tutte le schede del Report usano uguali.

   Perché sta qui: prima il numero grande, il titolo di card e lo stato vuoto
   erano scritti dentro la pagina e ogni sezione li riscriveva a modo suo.
   Con cinque schede quel modo diverso si vedrebbe subito. Una sola forma per
   i numeri, una per i titoli, una per i vuoti.
*/

export const GIORNI_LUNGHI = {
  lun: 'lunedì', mar: 'martedì', mer: 'mercoledì',
  gio: 'giovedì', ven: 'venerdì', sab: 'sabato', dom: 'domenica',
};

/** 12.4 -> "12,4" (i minuti, con la virgola italiana) */
export const minuti = (valore) =>
  Number(valore || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 });

/** "2026-11-08" -> "08/11" (le ascisse dei grafici) */
export const shortDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return d && m ? `${d}/${m}` : String(iso);
};

export const quota = (parte, totale) =>
  (totale ? Math.round((Number(parte || 0) / Number(totale)) * 100) : 0);

export const Vuoto = ({ titolo, aiuto }) => (
  <div className="py-10 text-center">
    <p className="font-medium text-muted-foreground">{titolo}</p>
    {aiuto && <p className="mt-1 text-sm text-muted-foreground">{aiuto}</p>}
  </div>
);

/** La variazione percentuale, con la freccia. Niente percentuali inventate. */
export const Percentuale = ({ valore, className = '' }) => {
  if (valore === null || valore === undefined) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-muted-foreground ${className}`}>
        <Minus className="h-3 w-3" />n.d.
      </span>
    );
  }
  const su = valore > 0;
  const giu = valore < 0;
  const Icona = su ? ArrowUpRight : giu ? ArrowDownRight : Minus;
  const colore = su ? 'text-emerald-600' : giu ? 'text-rose-600' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${colore} ${className}`}>
      <Icona className="h-3 w-3" />
      {valore > 0 ? '+' : ''}{valore.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%
    </span>
  );
};

/** Il numero grande di una scheda: etichetta, valore, poi il perché in piccolo. */
export const KpiCard = ({ label, value, sub, icon: Icona, tint = 'hsl(173,80%,40%)', delta }) => (
  <Card className="stat-modern">
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-[13px] sm:normal-case sm:tracking-normal">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums" style={{ color: tint }}>{value}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {delta !== undefined && <Percentuale valore={delta} />}
            {sub && <span className="min-w-0 truncate">{sub}</span>}
          </div>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${tint}1a` }}
        >
          <Icona className="h-4 w-4" style={{ color: tint }} />
        </div>
      </div>
    </CardContent>
  </Card>
);

/** La testata di una scheda: cosa stai guardando, in una riga. */
export const TestataScheda = ({ icona: Icona, titolo, descrizione, children }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Icona className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{titolo}</h2>
        {descrizione && <p className="mt-0.5 text-sm text-muted-foreground">{descrizione}</p>}
      </div>
    </div>
    {children && <div className="shrink-0">{children}</div>}
  </div>
);

/** Card con titolo, icona, sottotitolo e un'azione a destra. */
export const CardConTitolo = ({ icona: Icona, titolo, sotto, azione, className = '', children }) => (
  <Card className={className}>
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icona className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">{titolo}</span>
          </CardTitle>
          {sotto && <CardDescription className="mt-1">{sotto}</CardDescription>}
        </div>
        {azione}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

/** Una riga "voce a sinistra, numero a destra" con la barra sotto. */
export const RigaBarra = ({ etichetta, dettaglio, valore, quota: percentuale, colore = 'bg-primary' }) => (
  <div>
    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">{etichetta}</span>
      <span className="shrink-0 tabular-nums font-medium">{valore}</span>
    </div>
    {dettaglio && <p className="mb-1 truncate text-xs text-muted-foreground">{dettaglio}</p>}
    {percentuale !== undefined && (
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${colore}`} style={{ width: `${Math.min(100, Math.max(2, percentuale))}%` }} />
      </div>
    )}
  </div>
);

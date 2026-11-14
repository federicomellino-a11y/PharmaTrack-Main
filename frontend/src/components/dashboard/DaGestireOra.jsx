import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, Clock3, UserX, Euro, MapPinOff, Wallet, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { Badge } from '../ui/badge';

/* "Da gestire ora": cinque riquadri, un numero ciascuno, e sotto le consegne
   da chiudere per prime. Un riquadro a zero non sparisce: dice "niente da
   fare", cosi' l'assenza del problema e' un'informazione e non un dubbio. */

const TONI = {
  rosso: {
    icona: 'text-destructive',
    sfondo: 'bg-destructive/10',
    bordo: 'border-destructive/30',
    numero: 'text-destructive',
  },
  ambra: {
    icona: 'text-amber-600 dark:text-amber-400',
    sfondo: 'bg-amber-500/10',
    bordo: 'border-amber-500/30',
    numero: 'text-amber-700 dark:text-amber-300',
  },
};

const ICONE = {
  ritardo: Clock3,
  da_assegnare: UserX,
  incassi: Euro,
  fattorini: MapPinOff,
  turni: Wallet,
};

const Riquadro = ({ voce }) => {
  const tono = TONI[voce.tono] || TONI.ambra;
  const Icona = ICONE[voce.chiave] || AlertCircle;
  const vuoto = voce.conteggio === 0;
  return (
    <Link
      to={voce.to}
      data-testid={`da-gestire-${voce.chiave}`}
      className={`
        group flex flex-col rounded-xl border p-3 transition-colors
        ${vuoto ? 'border-border/70 bg-secondary/20 hover:bg-secondary/40' : `${tono.bordo} bg-card hover:bg-secondary/40`}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${vuoto ? 'bg-secondary' : tono.sfondo}`}>
          {vuoto
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            : <Icona className={`h-4 w-4 ${tono.icona}`} />}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className={`mt-2 text-2xl font-black tabular-nums leading-none ${vuoto ? 'text-muted-foreground/60' : tono.numero}`}>
        {voce.conteggio}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold leading-tight">{voce.etichetta}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
        {vuoto ? 'Niente da fare' : voce.descrizione}
      </p>
    </Link>
  );
};

export default function DaGestireOra({ voci = [], totale = 0 }) {
  const daChiudere = [];
  const visti = new Set();
  voci
    .filter((voce) => voce.chiave === 'ritardo' || voce.chiave === 'da_assegnare')
    .forEach((voce) => {
      voce.righe.forEach((riga) => {
        if (visti.has(riga.id)) return;
        visti.add(riga.id);
        daChiudere.push({ ...riga, motivo: voce.chiave === 'ritardo' ? 'In ritardo' : 'Da assegnare' });
      });
    });

  return (
    <section className="space-y-3" data-testid="da-gestire-ora">
      <div className="flex items-center gap-2">
        <AlertCircle className={`h-4 w-4 ${totale > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
        <h2 className="text-base font-semibold tracking-tight">Da gestire ora</h2>
        {totale > 0 && (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px]">
            {totale}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {voci.map((voce) => <Riquadro key={voce.chiave} voce={voce} />)}
      </div>

      {daChiudere.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-1.5">
          {daChiudere.slice(0, 5).map((riga) => (
            <Link
              key={riga.id}
              to={riga.to}
              data-testid={`urgent-${riga.id}`}
              className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-secondary/60"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${riga.motivo === 'In ritardo' ? 'bg-destructive' : 'bg-amber-500'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{riga.titolo}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {riga.motivo} · {riga.dettaglio}
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

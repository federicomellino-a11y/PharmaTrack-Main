import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Repeat, UserMinus, Loader2, Clock } from 'lucide-react';
import { useRicorrenzeQuery } from '@/hooks/queries';

/* Pazienti e ritorni, dentro la pagina Report.

   Prima si chiamava "Richiami" e aveva il pulsante del telefono. Federico
   (10/11): la farmacia non telefona davvero ai pazienti, quindi il nome
   prometteva un gesto che non avviene. Qui si segnala e basta: chi non ordina
   più e da quanti giorni, chi sta per tornare, chi ha la ricorrenza scaduta.
   Nessuna telefonata, nessun esito da compilare.
*/

const Elenco = ({ icona: Icona, titolo, sottotitolo, children, testid }) => (
  <Card data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icona className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{titolo}</h3>
        <span className="text-xs text-muted-foreground">{sottotitolo}</span>
      </div>
      {children}
    </CardContent>
  </Card>
);

const Riga = ({ voce, dettaglio, azione }) => (
  <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium truncate">{voce.name || 'Paziente'}</p>
      <p className="text-xs text-muted-foreground truncate">{dettaglio}</p>
    </div>
    {azione}
  </div>
);

export default function PazientiRicorrenti() {
  const { data, isLoading, error } = useRicorrenzeQuery();

  const daFare = data?.da_fare ?? [];
  const inArrivo = data?.in_arrivo ?? [];
  const fermi = data?.richiami ?? [];
  const vuoto = !isLoading && !daFare.length && !inArrivo.length && !fermi.length;

  return (
    <section className="space-y-4" data-testid="pazienti-ricorrenti">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Repeat className="w-5 h-5 text-emerald-500" />
          Pazienti e ritorni
        </h2>
        <p className="text-sm text-muted-foreground">
          Solo segnalazioni: chi non ordina più e da quanti giorni, chi ha la ricorrenza scaduta,
          chi sta per tornare. Nessun pulsante di chiamata, nessun esito da compilare.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Calcolo le liste…
        </div>
      )}

      {error && (
        <Card><CardContent className="p-4 text-sm text-destructive">
          Non riesco a leggere i dati dei pazienti. Riprova fra poco.
        </CardContent></Card>
      )}

      {vuoto && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nessuna ricorrenza da preparare e nessun paziente fermo.
            Imposta una ricorrenza dalla scheda di un paziente per farlo comparire qui.
          </CardContent>
        </Card>
      )}

      {fermi.length > 0 && (
        <Elenco
          icona={UserMinus}
          titolo="Non ordinano più"
          sottotitolo={`${fermi.length} pazienti`}
          testid="pazienti-fermi"
        >
          {fermi.map((voce) => (
            <Riga
              key={voce.customer_id}
              voce={voce}
              dettaglio={`ultimo ordine ${voce.ultimo_ordine || '—'}`}
              azione={
                <span className="text-xs font-semibold text-amber-600 whitespace-nowrap tabular-nums">
                  {voce.giorni_da_ultimo_ordine} gg
                </span>
              }
            />
          ))}
          <p className="pt-2 text-[11px] text-muted-foreground">
            Chi ordinava almeno due volte e non si fa vivo da più di {data?.giorni_richiamo ?? 45} giorni.
          </p>
        </Elenco>
      )}

      {daFare.length > 0 && (
        <Elenco
          icona={Repeat}
          titolo="Ricorrenza scaduta"
          sottotitolo={`${daFare.length} da preparare`}
          testid="ricorrenze-da-fare"
        >
          {daFare.map((voce) => (
            <Riga
              key={voce.customer_id}
              voce={voce}
              dettaglio={`${voce.fascia ? `${voce.fascia} · ` : ''}${voce.address || 'indirizzo mancante'}`}
              azione={
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">
                    {voce.giorni_di_ritardo === 0 ? 'oggi' : `${voce.giorni_di_ritardo} gg fa`}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/quick?customer_id=${voce.customer_id}`}>Prepara</Link>
                  </Button>
                </div>
              }
            />
          ))}
        </Elenco>
      )}

      {inArrivo.length > 0 && (
        <Elenco
          icona={Clock}
          titolo="In arrivo"
          sottotitolo={`${inArrivo.length} nei prossimi 7 giorni`}
          testid="ricorrenze-in-arrivo"
        >
          {inArrivo.map((voce) => (
            <Riga
              key={voce.customer_id}
              voce={voce}
              dettaglio={`${voce.fascia ? `${voce.fascia} · ` : ''}${voce.address || 'indirizzo mancante'}`}
              azione={
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {voce.giorni_alla_prossima === 0 ? 'oggi' : `fra ${voce.giorni_alla_prossima} gg`}
                </span>
              }
            />
          ))}
        </Elenco>
      )}
    </section>
  );
}

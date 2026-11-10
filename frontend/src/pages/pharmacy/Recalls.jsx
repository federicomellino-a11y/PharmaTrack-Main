import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Repeat, PhoneCall, UserMinus, Plus, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { FASCE, fasciaDi } from '@/lib/fasce';
import { chiavi } from '@/lib/api';
import { useRicorrenzeQuery } from '@/hooks/queries';

/* Ricorrenze e richiami.

   Due liste che il banco guarda al mattino, prima di aprire la saracinesca:
   chi aspetta la consegna periodica (terapie croniche) e chi non si fa vivo
   da troppo tempo. Il pulsante non crea la consegna: apre il Nuovo rapido con
   il paziente gia' scelto, perche' gli importi cambiano e l'indirizzo deve
   arrivare dall'anagrafica (regola del 6/11).
*/

const RICORRENZE_PRONTE = [30, 60, 90];

const Lezione = ({ icona: Icona, titolo, sottotitolo, children, testid }) => (
  <Card data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icona className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">{titolo}</h2>
        <span className="text-xs text-muted-foreground">{sottotitolo}</span>
      </div>
      {children}
    </CardContent>
  </Card>
);

const Riga = ({ voce, azione }) => (
  <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium truncate">{voce.name}</p>
      <p className="text-xs text-muted-foreground truncate">
        {voce.fascia ? `${voce.fascia} · ` : ''}
        {voce.address || 'indirizzo mancante'}
      </p>
    </div>
    {azione}
    {voce.phone ? (
      <Button asChild size="sm" variant="ghost" title={`Chiama ${voce.name}`}>
        <a href={`tel:${voce.phone}`}><PhoneCall className="w-4 h-4" /></a>
      </Button>
    ) : null}
    <Button asChild size="sm" variant="outline">
      <Link to={`/quick?customer_id=${voce.customer_id}`}>Prepara</Link>
    </Button>
  </div>
);

export default function RecallsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useRicorrenzeQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scelto, setScelto] = useState(null);
  const [giorni, setGiorni] = useState('30');
  const [fascia, setFascia] = useState('libera');
  const [salvataggio, setSalvataggio] = useState(false);

  const daFare = data?.da_fare ?? [];
  const inArrivo = data?.in_arrivo ?? [];
  const richiami = data?.richiami ?? [];
  const vuoto = !isLoading && !daFare.length && !inArrivo.length && !richiami.length;

  const ricarica = () => queryClient.invalidateQueries({ queryKey: chiavi.ricorrenze });

  const apri = (voce) => {
    setScelto(voce);
    setGiorni(String(voce.giorni_ricorrenza || 30));
    setFascia(fasciaDi(voce.fascia_da, voce.fascia_a)?.valore || 'subito');
    setDialogOpen(true);
  };

  const salva = async () => {
    const scelta = FASCE.find((f) => f.valore === fascia) || FASCE[0];
    setSalvataggio(true);
    try {
      await axios.put(`${API}/ricorrenze/${scelto.customer_id}`, {
        giorni: Number(giorni),
        fascia_da: scelta.da,
        fascia_a: scelta.a,
        attiva: true,
      }, { withCredentials: true });
      toast.success(`Ricorrenza impostata: ogni ${giorni} giorni`);
      setDialogOpen(false);
      await ricarica();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Ricorrenza non salvata');
    } finally {
      setSalvataggio(false);
    }
  };

  const spegni = async (voce) => {
    try {
      await axios.delete(`${API}/ricorrenze/${voce.customer_id}`, { withCredentials: true });
      toast.success('Ricorrenza tolta');
      await ricarica();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Non riesco a togliere la ricorrenza');
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Ricorrenze e richiami</h1>
          <p className="text-sm text-muted-foreground">
            Chi torna ogni mese e chi non si fa vivo da più di {data?.giorni_richiamo ?? 45} giorni.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Calcolo le liste…
          </div>
        )}

        {error && (
          <Card><CardContent className="p-4 text-sm text-destructive">
            Non riesco a leggere le ricorrenze. Riprova fra poco.
          </CardContent></Card>
        )}

        {vuoto && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nessuna ricorrenza da preparare e nessun paziente da richiamare.
              Imposta una ricorrenza dalla scheda di un paziente per farlo comparire qui.
            </CardContent>
          </Card>
        )}

        {daFare.length > 0 && (
          <Lezione icona={Repeat} titolo="Da preparare ora" sottotitolo={`${daFare.length}`} testid="ricorrenze-da-fare">
            {daFare.map((voce) => (
              <Riga
                key={voce.customer_id}
                voce={voce}
                azione={
                  <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">
                    {voce.giorni_di_ritardo === 0 ? 'oggi' : `${voce.giorni_di_ritardo} gg fa`}
                  </span>
                }
              />
            ))}
          </Lezione>
        )}

        {inArrivo.length > 0 && (
          <Lezione icona={Clock} titolo="In arrivo" sottotitolo={`${inArrivo.length} nei prossimi 7 giorni`} testid="ricorrenze-in-arrivo">
            {inArrivo.map((voce) => (
              <Riga
                key={voce.customer_id}
                voce={voce}
                azione={
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {voce.giorni_alla_prossima === 0 ? 'oggi' : `fra ${voce.giorni_alla_prossima} gg`}
                  </span>
                }
              />
            ))}
          </Lezione>
        )}

        {richiami.length > 0 && (
          <Lezione icona={UserMinus} titolo="Non ordinano da un po'" sottotitolo={`${richiami.length}`} testid="richiami">
            {richiami.map((voce) => (
              <Riga
                key={voce.customer_id}
                voce={voce}
                azione={
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {voce.giorni_da_ultimo_ordine} gg
                    </span>
                    <Button size="sm" variant="ghost" title="Ricorrenza" onClick={() => apri(voce)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                }
              />
            ))}
          </Lezione>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ricorrenza per {scelto?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ogni quanti giorni</Label>
              <div className="flex gap-2 mt-1">
                {RICORRENZE_PRONTE.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant={String(g) === giorni ? 'default' : 'outline'}
                    onClick={() => setGiorni(String(g))}
                  >
                    {g}
                  </Button>
                ))}
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={giorni}
                  onChange={(e) => setGiorni(e.target.value)}
                  className="w-20"
                  aria-label="giorni della ricorrenza"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Si conta dall&apos;ultimo ordine, non da oggi.
              </p>
            </div>
            <div>
              <Label>Fascia preferita</Label>
              <Select value={fascia} onValueChange={setFascia}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FASCE.filter((f) => f.valore !== 'preciso').map((f) => (
                    <SelectItem key={f.etichetta} value={f.valore}>
                      {f.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            {scelto?.giorni_ricorrenza ? (
              <Button type="button" variant="ghost" onClick={() => { setDialogOpen(false); spegni(scelto); }}>
                Togli ricorrenza
              </Button>
            ) : null}
            <Button type="button" onClick={salva} disabled={salvataggio}>
              {salvataggio ? 'Salvo…' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import { Clock, Plus, Save, Trash2 } from 'lucide-react';
import { FASCIA_PRIMA, MASSIMO_FASCE, normalizzaFasce, testoFasciaBreve } from '@/lib/fasce';
import { GIORNI_SETTIMANA, giorniConsegnati, taglioOrdini } from '@/lib/giorniConsegna';

/* OrariConsegnaCard: le fasce che la farmacia promette al paziente.

   Prima erano quattro righe scritte nel codice ("Mattina 9-12", "Sera 18-20")
   uguali per tutti. Ma gli orari di consegna sono una cosa della farmacia:
   c'e' chi chiude all'una, chi consegna solo il pomeriggio, chi tiene aperto
   fino alle 20:30. Qui si cambiano, e restano le stesse nel modulo consegna e
   nel link che apre il paziente.

   Insieme alle fasce sta la fascia predefinita, perche' e' la stessa domanda:
   quando consegni di solito. Una cosa sola da salvare, in fondo alla scheda.
*/
export default function OrariConsegnaCard({ onSalva, saving, setSettings, settings }) {
  const fasce = Array.isArray(settings.fasce) ? settings.fasce : [];
  const giorni = giorniConsegnati(settings);

  const cambia = (indice, campo, valore) => setSettings((prev) => ({
    ...prev,
    fasce: prev.fasce.map((fascia, i) => (i === indice ? { ...fascia, [campo]: valore } : fascia)),
  }));

  const aggiungi = () => setSettings((prev) => ({
    ...prev,
    fasce: [...prev.fasce, { etichetta: '', da: '', a: '' }],
  }));

  const rimuovi = (indice) => setSettings((prev) => ({
    ...prev,
    fasce: prev.fasce.filter((_, i) => i !== indice),
  }));

  const validate = normalizzaFasce(fasce);
  const perLaTendina = validate.ok ? validate.fasce : fasce.filter((f) => f && f.da && f.a);
  const predefinita = settings.fascia_predefinita || FASCIA_PRIMA.valore;

  return (
    <Card data-testid="orari-consegna">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />Orari di consegna
        </CardTitle>
        <CardDescription>
          Le fasce che scegli quando crei una consegna: sono le stesse che il paziente legge dal link di
          tracciamento. Se domani cambi orario, torni qui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {fasce.map((fascia, indice) => (
            <div key={indice} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
                <div>
                  <Label className="text-xs">Come si chiama</Label>
                  <Input
                    value={fascia.etichetta || ''}
                    placeholder="Es. Pomeriggio"
                    onChange={(e) => cambia(indice, 'etichetta', e.target.value)}
                    data-testid={`fascia-etichetta-${indice}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">Dalle</Label>
                  <Input
                    type="time"
                    value={fascia.da || ''}
                    onChange={(e) => cambia(indice, 'da', e.target.value)}
                    aria-label={`Inizio fascia ${indice + 1}`}
                  />
                </div>
                <div>
                  <Label className="text-xs">Alle</Label>
                  <Input
                    type="time"
                    value={fascia.a || ''}
                    onChange={(e) => cambia(indice, 'a', e.target.value)}
                    aria-label={`Fine fascia ${indice + 1}`}
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => rimuovi(indice)}
                  disabled={fasce.length <= 1}
                  title="Togli questa fascia"
                  aria-label={`Togli la fascia ${indice + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={aggiungi}
            disabled={fasce.length >= MASSIMO_FASCE}
            data-testid="aggiungi-fascia"
          >
            <Plus className="w-4 h-4 mr-2" />Aggiungi fascia
          </Button>
          <p className="text-xs text-muted-foreground">
            Si consegna fra le 06:00 e le 23:00. Oltre {MASSIMO_FASCE} fasce il menu diventa un indovinello.
          </p>
        </div>

        {!validate.ok && (
          <p className="text-xs text-destructive" data-testid="errore-fasce">{validate.errore}</p>
        )}

        <Separator />

        <div>
          <Label>Fascia predefinita per le nuove consegne</Label>
          <Select
            value={predefinita}
            onValueChange={(valore) => setSettings((prev) => ({ ...prev, fascia_predefinita: valore }))}
          >
            <SelectTrigger data-testid="fascia-predefinita"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FASCIA_PRIMA.valore}>La prima possibile</SelectItem>
              {perLaTendina.map((fascia) => (
                <SelectItem key={`${fascia.da}-${fascia.a}`} value={`${fascia.da}-${fascia.a}`}>
                  {testoFasciaBreve(fascia)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Cosi&apos; il modulo consegna si apre gia&apos; sull&apos;orario giusto. &quot;La prima possibile&quot; e
            &quot;Orario preciso&quot; ci sono sempre: non sono fasce, sono modi di dire quando.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Le consegne gia&apos; prese tengono l&apos;orario promesso: cambiare una fascia vale dalle prossime.
        </p>

        <Separator />

        <div>
          <Label>Giorni in cui consegni</Label>
          <div className="mt-2 flex flex-wrap gap-2" data-testid="giorni-consegna">
            {GIORNI_SETTIMANA.map(({ numero, breve, nome }) => {
              const acceso = giorni.includes(numero);
              return (
                <Button
                  key={numero}
                  type="button"
                  size="sm"
                  variant={acceso ? 'default' : 'outline'}
                  className="w-14"
                  aria-pressed={acceso}
                  aria-label={nome}
                  onClick={() => setSettings((prev) => {
                    const scelti = giorniConsegnati({ giorni_consegna: prev.giorni_consegna });
                    const nuovi = acceso ? scelti.filter((g) => g !== numero) : [...scelti, numero];
                    // L'ultimo giorno acceso non si spegne: il fattorino gira
                    // almeno un giorno, altrimenti nessuna data sarebbe giusta.
                    return nuovi.length ? { ...prev, giorni_consegna: nuovi } : prev;
                  })}
                >
                  {breve}
                </Button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Il modulo &quot;Nuova consegna&quot; propone gia&apos; il primo giorno buono: se oggi non consegni, parte da domani.
          </p>
        </div>

        <div>
          <Label htmlFor="taglio-ordini">Ordini presi entro le</Label>
          <Input
            id="taglio-ordini"
            type="time"
            value={taglioOrdini(settings)}
            onChange={(e) => setSettings((prev) => ({ ...prev, taglio_ordini: e.target.value }))}
            data-testid="taglio-ordini"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Dopo quest&apos;ora un ordine si propone per il giorno dopo: e&apos; il momento in cui il fattorino
            esce, non un&apos;imposizione.
          </p>
        </div>

        <Button type="button" onClick={onSalva} disabled={saving || !validate.ok} data-testid="salva-orari">
          <Save className="w-4 h-4 mr-2" />{saving ? 'Salvataggio...' : 'Salva orari'}
        </Button>
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { API } from '@/lib/config';
import { chiavi } from '@/lib/api';

/** Consegna periodica del paziente: ogni quanti giorni torna. Compare poi in Report. */
export default function RicorrenzaCliente({ cliente }) {
  const queryClient = useQueryClient();
  const [attiva, setAttiva] = useState(Boolean(cliente.ricorrenza_attiva && cliente.ricorrenza_giorni));
  const [giorni, setGiorni] = useState(String(cliente.ricorrenza_giorni || 30));
  const [invio, setInvio] = useState(false);
  const indirizzo = `${API}/ricorrenze/${cliente.customer_id}`;

  const esegui = async (chiamata, messaggio, nuovoStato) => {
    setInvio(true);
    try {
      await chiamata();
      setAttiva(nuovoStato);
      queryClient.invalidateQueries({ queryKey: chiavi.ricorrenze });
      toast.success(messaggio);
    } catch (err) {
      const dettaglio = err.response?.data?.detail;
      toast.error(typeof dettaglio === 'string' ? dettaglio : dettaglio?.motivo || 'Ricorrenza non salvata');
    } finally {
      setInvio(false);
    }
  };

  const salva = () => {
    const numero = Number(giorni);
    if (!Number.isInteger(numero) || numero < 1 || numero > 365) return toast.error('I giorni vanno da 1 a 365');
    return esegui(
      () => axios.put(indirizzo, { giorni: numero, attiva: true }, { withCredentials: true }),
      'Ricorrenza salvata', true,
    );
  };

  const togli = () => esegui(() => axios.delete(indirizzo, { withCredentials: true }), 'Ricorrenza tolta', false);

  return (
    <Card data-testid="ricorrenza-cliente">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Repeat className="w-5 h-5 text-emerald-500" />Consegna periodica
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Ogni</span>
        <Input
          type="number" min="1" max="365" value={giorni}
          onChange={(e) => setGiorni(e.target.value)}
          className="w-24" data-testid="ricorrenza-giorni"
        />
        <span className="text-sm">giorni</span>
        <Button onClick={salva} disabled={invio} data-testid="ricorrenza-salva">{attiva ? 'Aggiorna' : 'Attiva'}</Button>
        {attiva && (
          <Button variant="ghost" onClick={togli} disabled={invio} data-testid="ricorrenza-togli">Togli</Button>
        )}
        <span className="text-xs text-muted-foreground" data-testid="ricorrenza-stato">
          {attiva ? 'Attiva' : 'Non impostata'}
        </span>
      </CardContent>
    </Card>
  );
}

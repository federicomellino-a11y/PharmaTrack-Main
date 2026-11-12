import React, { useState } from 'react';
import axios from 'axios';
import { Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { API } from '@/lib/config';
import { formatDate } from '@/lib/format';

const DURATE = [
  { valore: '1', etichetta: '1 mese' },
  { valore: '3', etichetta: '3 mesi' },
  { valore: '12', etichetta: '12 mesi' },
  { valore: 'sempre', etichetta: 'Senza scadenza' },
  { valore: 'data', etichetta: 'Fino al…' },
];

const descrivi = (stato) => {
  const scelta = stato?.assegnazione;
  if (!scelta) return { testo: stato?.pro ? 'Automatico · Pro aperto' : 'Automatico', tono: 'secondary' };
  if (!scelta.attivo) return { testo: 'Pro spento', tono: 'destructive' };
  return {
    testo: scelta.scadenza ? `Pro attivo fino al ${formatDate(scelta.scadenza)}` : 'Pro attivo senza scadenza',
    tono: 'default',
  };
};

/** Funzioni Pro di una farmacia: l'amministratore le accende (con durata), le spegne o lascia fare al piano. */
export default function AssegnaProCard({ utente, onAggiornato }) {
  const [durata, setDurata] = useState('1');
  const [data, setData] = useState('');
  const [invio, setInvio] = useState(false);
  const stato = descrivi(utente?.piano_stato);

  const salva = async (corpo, messaggio) => {
    setInvio(true);
    try {
      const risposta = await axios.put(`${API}/admin/users/${utente.user_id}/pro`, corpo, { withCredentials: true });
      onAggiornato?.(risposta.data);
      toast.success(messaggio);
    } catch (err) {
      const dettaglio = err.response?.data?.detail;
      toast.error(typeof dettaglio === 'string' ? dettaglio : 'Assegnazione non riuscita');
    } finally {
      setInvio(false);
    }
  };

  const attiva = () => {
    if (durata === 'data') {
      if (!data) return toast.error('Scegli la data di scadenza');
      return salva({ stato: 'attivo', scadenza: data }, 'Funzioni Pro attivate');
    }
    if (durata === 'sempre') return salva({ stato: 'attivo' }, 'Funzioni Pro attivate');
    return salva({ stato: 'attivo', mesi: Number(durata) }, 'Funzioni Pro attivate');
  };

  return (
    <Card className="border-purple-500/30" data-testid="admin-pro-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-purple-400" />Funzioni Pro
        </CardTitle>
        <Badge variant={stato.tono} data-testid="admin-pro-stato">{stato.testo}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {DURATE.map((voce) => (
            <Button
              key={voce.valore}
              type="button"
              size="sm"
              variant={durata === voce.valore ? 'default' : 'outline'}
              onClick={() => setDurata(voce.valore)}
              data-testid={`admin-pro-durata-${voce.valore}`}
            >
              {voce.etichetta}
            </Button>
          ))}
          {durata === 'data' && (
            <Input
              type="date"
              value={data}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setData(e.target.value)}
              className="w-44 h-9"
              data-testid="admin-pro-data"
            />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={attiva} disabled={invio} data-testid="admin-pro-attiva">Attiva Pro</Button>
          <Button variant="outline" onClick={() => salva({ stato: 'spento' }, 'Funzioni Pro spente')} disabled={invio} data-testid="admin-pro-spegni">
            Spegni Pro
          </Button>
          <Button variant="ghost" onClick={() => salva({ stato: 'automatico' }, 'Tornato alle regole del piano')} disabled={invio} data-testid="admin-pro-automatico">
            Automatico
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

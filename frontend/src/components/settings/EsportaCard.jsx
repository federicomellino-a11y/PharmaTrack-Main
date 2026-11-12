import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { chiavi, letture } from '@/lib/api';
import { ESPORTAZIONI, esporta } from '@/lib/esportazioni';
import { funzioneSbloccata } from '@/lib/funzioniPro';

/* EsportaCard: l'unico punto da cui si scaricano i dati.

   Prima ogni pagina aveva il suo pulsante "Esporta": chi voleva i fattorini
   non sapeva dove guardare, e chi aggiungeva una pagina si inventava un altro
   formato. Ora si sceglie dal menu e si scarica un file solo, con lo stesso
   BOM per Excel. Le voci che stanno nel piano Professional non compaiono se
   la funzione è chiusa: un pulsante che risponde 402 non serve a nessuno.
*/
export default function EsportaCard({ piano }) {
  const queryClient = useQueryClient();
  const voci = ESPORTAZIONI.filter((voce) => !voce.funzionePro || funzioneSbloccata(piano, voce.funzionePro));
  const [scelta, setScelta] = useState('consegne');
  const [occupato, setOccupato] = useState(false);

  const attiva = voci.some((voce) => voce.chiave === scelta) ? scelta : voci[0]?.chiave;

  const scarica = async () => {
    if (!attiva) return;
    setOccupato(true);
    try {
      const righe = await esporta(attiva, queryClient, letture, chiavi);
      if (!righe) {
        toast.info('Non c\'è niente da esportare: il file non è stato creato');
        return;
      }
      toast.success(`${righe} ${righe === 1 ? 'riga esportata' : 'righe esportate'}`);
    } catch {
      toast.error('Esportazione non riuscita, riprova');
    } finally {
      setOccupato(false);
    }
  };

  return (
    <Card data-testid="esporta-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />Esporta i dati
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={attiva} onValueChange={setScelta}>
            <SelectTrigger className="w-full sm:flex-1" data-testid="export-select">
              <SelectValue placeholder="Cosa vuoi esportare?" />
            </SelectTrigger>
            <SelectContent>
              {voci.map((voce) => (
                <SelectItem key={voce.chiave} value={voce.chiave}>{voce.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={scarica} disabled={occupato || !attiva} className="w-full sm:w-auto" data-testid="export-download">
            {occupato ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {occupato ? 'Preparo...' : 'Scarica CSV'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ClipboardPaste, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { API } from '@/lib/config';

// Il riconoscimento parla di "card", il resto dell'app di "pos".
const PAGAMENTO = { cash: 'cash', card: 'pos', pos: 'pos' };

export const parametriVendita = (campi = {}) => {
  const parametri = new URLSearchParams({ origine: 'incolla' });
  if (campi.cliente) parametri.set('customer_name', campi.cliente);
  if (campi.codice_fiscale) parametri.set('fiscal_code', campi.codice_fiscale);
  if (campi.importo != null) parametri.set('amount', String(campi.importo));
  if (PAGAMENTO[campi.pagamento]) parametri.set('payment_method', PAGAMENTO[campi.pagamento]);
  if (campi.ricette) parametri.set('notes', `Ricette: ${campi.ricette}`);
  return parametri.toString();
};

/** Copia la vendita in Winfarm, incollala qui: la consegna si apre già compilata. Niente da installare. */
export default function IncollaVendita() {
  const navigate = useNavigate();
  const [testo, setTesto] = useState('');
  const [lettura, setLettura] = useState(false);

  const dagliAppunti = async () => {
    try {
      const copiato = await navigator.clipboard.readText();
      if (!copiato.trim()) return toast.error('Negli appunti non c’è testo: copia prima la vendita in Winfarm');
      setTesto(copiato);
    } catch {
      toast.error('Il browser non lascia leggere gli appunti: incolla con Ctrl+V');
    }
  };

  const leggi = async () => {
    if (!testo.trim()) return toast.error('Incolla prima la vendita');
    setLettura(true);
    try {
      const { data } = await axios.post(`${API}/integrations/winfarm/parse`, { testo }, { withCredentials: true });
      if (!data.riconosciuti?.length) {
        toast.error('Non ho riconosciuto cliente né importo: controlla di aver copiato la vendita');
        return;
      }
      navigate(`/quick?${parametriVendita(data.campi)}`);
    } catch (err) {
      const dettaglio = err.response?.data?.detail;
      toast.error(typeof dettaglio === 'string' ? dettaglio : 'Lettura non riuscita, riprova');
    } finally {
      setLettura(false);
    }
  };

  return (
    <Card className="border-primary/30" data-testid="incolla-vendita">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-primary" />
          <p className="font-semibold text-sm">Incolla la vendita</p>
        </div>
        <p className="text-xs text-muted-foreground">
          In Winfarm seleziona la vendita e premi Ctrl+C, poi incollala qui.
        </p>
        <Textarea
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Ctrl+V"
          rows={5}
          className="font-mono text-xs"
          data-testid="incolla-vendita-testo"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={dagliAppunti} data-testid="incolla-vendita-appunti">
            Incolla dagli appunti
          </Button>
          <Button size="sm" className="gap-2" onClick={leggi} disabled={lettura} data-testid="incolla-vendita-crea">
            {lettura ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Crea la consegna
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSessioniQuery } from '@/hooks/queries';
import { API } from '@/lib/config';
import { ensureArray } from '@/lib/collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { KeyRound, Laptop, LogOut, Save, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';

/* AccountCard: chi sei tu, la password e i dispositivi connessi.

   Prima la scheda Profilo era un vicolo cieco: mostrava nome, email e avatar
   senza lasciar toccare niente, e per cambiare password bisognava uscire e
   passare dal "password dimenticata". Qui si fa tutto da dentro.
*/
const vuoto = { current_password: '', new_password: '', conferma: '' };

export default function AccountCard({ onSaveName, salvandoNome, user }) {
  const [nome, setNome] = useState(user?.name || '');
  const [password, setPassword] = useState(vuoto);
  const [salvandoPassword, setSalvandoPassword] = useState(false);

  useEffect(() => {
    setNome(user?.name || '');
  }, [user?.name]);

  // L'elenco arriva dall'hook, come ogni altra lettura: niente axios nei componenti.
  const { data: sessioniQuery = [], isFetching: leggendoDispositivi, refetch: ricaricaSessioni } = useSessioniQuery();
  const dispositivi = ensureArray(sessioniQuery);
  const caricaDispositivi = ricaricaSessioni;

  const cambiaPassword = async (evento) => {
    evento.preventDefault();
    if (password.new_password.length < 8) {
      toast.error('La nuova password deve avere almeno 8 caratteri');
      return;
    }
    if (password.new_password !== password.conferma) {
      toast.error('Le due password nuove non coincidono');
      return;
    }
    setSalvandoPassword(true);
    try {
      await axios.post(`${API}/auth/change-password`, {
        current_password: password.current_password,
        new_password: password.new_password,
      }, { withCredentials: true });
      setPassword(vuoto);
      toast.success('Password aggiornata: le altre sessioni sono state chiuse');
      caricaDispositivi();
    } catch (errore) {
      const motivo = errore.response?.data?.detail || 'Cambio password non riuscito';
      toast.error(motivo);
    } finally {
      setSalvandoPassword(false);
    }
  };

  const esciDagliAltri = async () => {
    try {
      const { data } = await axios.post(`${API}/auth/sessions/revoke`, {}, { withCredentials: true });
      toast.success(data?.chiuse ? `Chiuse ${data.chiuse} sessioni` : 'Nessun altro dispositivo connesso');
      caricaDispositivi();
    } catch (errore) {
      toast.error(errore.response?.data?.detail || 'Non sono riuscito a chiudere le sessioni');
    }
  };

  const altriDispositivi = dispositivi.filter((d) => !d.corrente).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary" />Il tuo account</CardTitle>
          <CardDescription>Il nome con cui firmi le consegne e l'email di accesso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="account-nome">Nome e cognome</Label>
            <Input
              id="account-nome"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Es. Maria Rossi"
              data-testid="account-nome"
            />
          </div>
          <div>
            <Label>Email</Label>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium" data-testid="account-email">{user?.email}</p>
              <Badge variant="outline">Per cambiarla scrivi all'assistenza</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              L'email e' la chiave d'accesso del tuo account: si cambia a mano per evitare che un errore di battitura ti chiuda fuori.
            </p>
          </div>
          <Button type="button" onClick={() => onSaveName(nome)} disabled={salvandoNome || nome === (user?.name || '')} data-testid="account-salva-nome">
            <Save className="w-4 h-4 mr-2" />{salvandoNome ? 'Salvataggio...' : 'Salva nome'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />Password</CardTitle>
          <CardDescription>Cambiala da qui, senza uscire e senza aspettare una mail</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={cambiaPassword} className="space-y-4">
            <div>
              <Label htmlFor="password-attuale">Password attuale</Label>
              <Input
                id="password-attuale"
                type="password"
                autoComplete="current-password"
                value={password.current_password}
                onChange={(evento) => setPassword((prima) => ({ ...prima, current_password: evento.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="password-nuova">Nuova password</Label>
              <Input
                id="password-nuova"
                type="password"
                autoComplete="new-password"
                value={password.new_password}
                onChange={(evento) => setPassword((prima) => ({ ...prima, new_password: evento.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Almeno 8 caratteri.</p>
            </div>
            <div>
              <Label htmlFor="password-conferma">Ripeti la nuova password</Label>
              <Input
                id="password-conferma"
                type="password"
                autoComplete="new-password"
                value={password.conferma}
                onChange={(evento) => setPassword((prima) => ({ ...prima, conferma: evento.target.value }))}
              />
            </div>
            <Button type="submit" disabled={salvandoPassword || !password.current_password || !password.new_password}>
              <ShieldCheck className="w-4 h-4 mr-2" />{salvandoPassword ? 'Aggiornamento...' : 'Aggiorna password'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Cambiando la password si chiudono le sessioni aperte sugli altri dispositivi.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Laptop className="w-5 h-5 text-primary" />Dispositivi connessi</CardTitle>
          <CardDescription>Dove il tuo account e' aperto in questo momento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {leggendoDispositivi && <p className="text-sm text-muted-foreground">Lettura in corso...</p>}
          {!leggendoDispositivi && (
            <ul className="space-y-2" data-testid="account-dispositivi">
              {dispositivi.map((dispositivo) => (
                <li key={dispositivo.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/30 p-3">
                  <div>
                    <p className="font-medium">{dispositivo.dispositivo}</p>
                    <p className="text-xs text-muted-foreground">
                      Accesso del {dispositivo.created_at ? new Date(dispositivo.created_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'non registrato'}
                    </p>
                  </div>
                  {dispositivo.corrente && <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Questo dispositivo</Badge>}
                </li>
              ))}
            </ul>
          )}
          <Separator />
          <Button type="button" variant="outline" onClick={esciDagliAltri} disabled={!altriDispositivi} data-testid="account-esci-altri">
            <LogOut className="w-4 h-4 mr-2" />Esci dagli altri dispositivi
          </Button>
          <p className="text-xs text-muted-foreground">
            {altriDispositivi
              ? `${altriDispositivi} sessioni aperte altrove. Utile se hai prestato il telefono o il PC del banco.`
              : 'Sei collegato solo da qui.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

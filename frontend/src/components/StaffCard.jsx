import React, { useState } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffQuery } from '@/hooks/queries';
import { chiavi } from '@/lib/api';

const RUOLI = [
  { valore: 'operatore', etichetta: 'Operatore al banco' },
  { valore: 'magazzino', etichetta: 'Magazzino e preparazione' },
];

/**
 * Accessi separati per chi lavora nella stessa farmacia.
 * Regola (7/11): ogni sede ha il suo account; dentro una sede, ogni persona
 * ha il suo accesso invece di usare la password del titolare.
 */
export default function StaffCard() {
  const [nuovo, setNuovo] = useState({ name: '', email: '', password: '', staff_role: 'operatore' });
  const [salvataggio, setSalvataggio] = useState(false);
  const queryClient = useQueryClient();
  // La lettura passa da react-query come tutto il resto: lo staff ha la sua
  // chiave in src/lib/api.js e ogni scrittura la invalida.
  const { data: membri = [], isLoading: caricamento, error: erroreQuery } = useStaffQuery();

  const errore = erroreQuery
    ? (erroreQuery?.response?.status === 403 ? 'Solo il titolare vede questa scheda' : 'Elenco non disponibile')
    : null;
  const carica = () => queryClient.invalidateQueries({ queryKey: chiavi.staff });

  const aggiungi = async (e) => {
    e.preventDefault();
    setSalvataggio(true);
    try {
      await axios.post(`${API}/staff`, nuovo, { withCredentials: true });
      toast.success('Accesso creato: può entrare con la sua email');
      setNuovo({ name: '', email: '', password: '', staff_role: 'operatore' });
      await carica();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Creazione non riuscita');
    } finally {
      setSalvataggio(false);
    }
  };

  const disattiva = async (membro) => {
    try {
      await axios.delete(`${API}/staff/${membro.user_id}`, { withCredentials: true });
      toast.success(`Accesso di ${membro.name} disattivato`);
      await carica();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Disattivazione non riuscita');
    }
  };

  return (
    <Card data-testid="staff-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Accessi staff
        </CardTitle>
        <CardDescription>
          Chi lavora al banco entra con la sua email e lavora sulle stesse consegne, senza sapere la tua password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {caricamento ? (
          <p className="text-sm text-muted-foreground">Carico gli accessi…</p>
        ) : errore ? (
          <p className="text-sm text-muted-foreground">{errore}</p>
        ) : membri.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ancora nessun accesso oltre al tuo.</p>
        ) : (
          <ul className="space-y-2">
            {membri.map((membro) => (
              <li key={membro.user_id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{membro.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{membro.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{membro.ruolo_leggibile}</Badge>
                  {membro.is_active ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => disattiva(membro)}
                      title="Disattiva questo accesso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Badge variant="outline">disattivato</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={aggiungi} className="space-y-3 border-t pt-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="w-4 h-4 text-primary" />
            Aggiungi un accesso
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="staff-name">Nome</Label>
              <Input
                id="staff-name"
                value={nuovo.name}
                onChange={(e) => setNuovo({ ...nuovo, name: e.target.value })}
                placeholder="Maria Rossi"
                required
                minLength={2}
              />
            </div>
            <div>
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={nuovo.email}
                onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })}
                placeholder="maria@farmacia.it"
                required
              />
            </div>
            <div>
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="text"
                value={nuovo.password}
                onChange={(e) => setNuovo({ ...nuovo, password: e.target.value })}
                placeholder="Almeno 8 caratteri"
                required
                minLength={8}
              />
            </div>
            <div>
              <Label htmlFor="staff-role">Ruolo</Label>
              <select
                id="staff-role"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={nuovo.staff_role}
                onChange={(e) => setNuovo({ ...nuovo, staff_role: e.target.value })}
              >
                {RUOLI.map((r) => (
                  <option key={r.valore} value={r.valore}>{r.etichetta}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            La password la scegli tu e la comunichi a voce: la persona potrà cambiarla dalle sue impostazioni.
          </p>
          <Button type="submit" disabled={salvataggio} className="w-full sm:w-auto">
            {salvataggio ? 'Creo…' : 'Crea accesso'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

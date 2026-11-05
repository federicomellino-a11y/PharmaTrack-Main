import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, ArrowLeft, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verificaCodice, admin, loading } = useAdminAuth();
  const postLoginRoute = useMemo(
    () => (location.pathname.startsWith('/console-federico') ? '/console-federico/dashboard' : '/admin'),
    [location.pathname],
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codice, setCodice] = useState('');
  const [fase, setFase] = useState('credenziali');
  const [destinatario, setDestinatario] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (admin) navigate(postLoginRoute, { replace: true });
  }, [admin, navigate, postLoginRoute]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const esito = await login(email, password);
      // Password giusta ma secondo fattore attivo: il codice e' in viaggio.
      if (esito?.secondoFattore === 'email') {
        setDestinatario(esito.destinatario || '');
        setFase('codice');
        setCodice('');
        return;
      }
      navigate(postLoginRoute, { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Accesso non riuscito');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodice = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await verificaCodice(codice);
      navigate(postLoginRoute, { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Codice non valido');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="spinner" /></div>;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 gradient-mesh">
      <div className="w-full max-w-md space-y-4">
        <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Torna alla home
        </Button>

        <Card className="shadow-xl border-primary/15">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Super amministratore</CardTitle>
            <CardDescription>Gestisci iscritti, database e dati globali di PharmaTrack</CardDescription>
          </CardHeader>
          <CardContent>
            {fase === 'codice' ? (
              <form onSubmit={handleCodice} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Codice a 6 cifre inviato a {destinatario || 'la tua email'}. Vale dieci minuti.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="codice">Codice di accesso</Label>
                  <Input
                    id="codice"
                    value={codice}
                    onChange={(e) => setCodice(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="text-center text-xl tracking-[0.4em]"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting || codice.length !== 6}>
                  {submitting ? 'Verifica...' : 'Entra'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setFase('credenziali'); setError(''); setCodice(''); }}
                >
                  Torna alle credenziali
                </Button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="admin-email">Email admin</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required autoComplete="email" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required autoComplete="current-password" />
                </div>
              </div>

              <Button type="submit" className="w-full btn-primary" disabled={submitting}>
                {submitting ? 'Accesso in corso...' : 'Accedi come admin'}
              </Button>
            </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

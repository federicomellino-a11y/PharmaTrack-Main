import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { ArrowLeft, AlertCircle, CheckCircle2, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Inserisci un indirizzo email valido');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await axios.post(`${API}/auth/forgot-password`, { email });
      setSent(true);
    } catch (err) {
      const msg = err.response?.data?.detail;
      setError(msg || 'Errore durante l\'invio. Riprova.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-4">
        <Link to="/login" className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Torna al login</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Recupera password</CardTitle>
            <CardDescription>
              Inserisci la tua email e ti invieremo un link per reimpostare la password
            </CardDescription>
          </CardHeader>

          <CardContent>
            {sent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Email inviata!</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Se esiste un account con l'indirizzo <strong>{email}</strong>, riceverai a breve un'email con le istruzioni per reimpostare la password.
                </p>
                <p className="text-xs text-muted-foreground mb-6">
                  Non hai ricevuto nulla? Controlla la cartella spam o riprova tra qualche minuto.
                </p>
                <Button className="w-full btn-primary" asChild>
                  <Link to="/login">Torna al login</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email del tuo account</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="mario@farmacia.it"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    className={`h-12 text-base ${error ? 'border-destructive' : ''}`}
                    autoComplete="email"
                    autoCapitalize="none"
                  />
                  {error && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{error}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full btn-primary h-12 text-base font-semibold" disabled={submitting}>
                  {submitting ? 'Invio in corso...' : 'Invia link di recupero'}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Ricordi la password?{' '}
                  <Link to="/login" className="text-primary hover:underline font-semibold">Accedi</Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

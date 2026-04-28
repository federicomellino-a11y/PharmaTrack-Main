import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isGoogleConfigured, loadGoogleSignIn, setGoogleCredentialCallback, promptGoogleSignIn } from '@/lib/googleAuth';

function GoogleSignInButton({ onCredential, label = 'Continua con Google' }) {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setGoogleCredentialCallback((credential) => {
      setLoading(false);
      onCredential(credential);
    });
    loadGoogleSignIn().then(setReady);
  }, [onCredential]);

  if (!isGoogleConfigured()) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-12 gap-3 text-base font-medium"
      onClick={() => {
        if (!ready) { toast.error('Libreria Google non ancora pronta. Riprova.'); return; }
        setLoading(true);
        promptGoogleSignIn(() => setLoading(false));
      }}
      disabled={loading}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      {loading ? 'Connessione...' : label}
    </Button>
  );
}

export default function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { if (user) navigate('/dashboard'); }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!email || !/\S+@\S+\.\S+/.test(email)) errs.email = 'Email non valida';
    if (!password) errs.password = 'Password obbligatoria';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.detail;
      if (msg === 'Credenziali non valide') setErrors({ password: 'Email o password errati' });
      else toast.error(msg || 'Errore di connessione');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = useCallback(async (credential) => {
    try {
      await loginWithGoogle(credential);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Accesso con Google fallito');
    }
  }, [loginWithGoogle, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-4">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span className="text-sm">Torna alla home</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-4">
            <img src="/logo.png" alt="PharmaTrack" className="h-14 w-auto mx-auto mb-4" />
            <CardTitle className="text-2xl">Bentornato!</CardTitle>
            <CardDescription>Accedi alla tua farmacia</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isGoogleConfigured() && (
              <>
                <GoogleSignInButton onCredential={handleGoogleCredential} label="Accedi con Google" />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground">oppure</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="mario@farmacia.it"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({...p, email: null})); }}
                  className={`h-12 text-base ${errors.email ? 'border-destructive' : ''}`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                />
                {errors.email && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Password dimenticata?</Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="La tua password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(p => ({...p, password: null})); }}
                    className={`h-12 text-base pr-11 ${errors.password ? 'border-destructive' : ''}`}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.password}</p>}
              </div>

              <Button type="submit" className="w-full btn-primary h-12 text-base font-semibold" disabled={submitting}>
                {submitting ? 'Accesso in corso...' : 'Accedi'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Non hai un account?{' '}
                <Link to="/register" className="text-primary hover:underline font-semibold">Registrati gratis</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { isGoogleConfigured, loadGoogleSignIn, setGoogleCredentialCallback, promptGoogleSignIn } from '@/lib/googleAuth';

function FormField({ id, label, type = 'text', placeholder, value, error, required, showToggle, show, onToggle, onChange, autoComplete }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="text-destructive ml-1">*</span>}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showToggle ? (show ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={`h-12 text-base ${error ? 'border-destructive' : ''}`}
          autoCapitalize={type === 'email' ? 'none' : undefined}
          autoCorrect="off"
          autoComplete={autoComplete}
        />
        {showToggle && (
          <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

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

export default function RegisterPage() {
  const { user, register, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', pharmacyName: '', pharmacyAddress: '', pharmacyPhone: '', pharmacyLat: null, pharmacyLng: null, email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => { if (user) navigate('/dashboard'); }, [user, navigate]);

  const setField = (field) => (e) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name) errs.name = 'Nome obbligatorio';
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Email non valida';
    if (!form.password || form.password.length < 6) errs.password = 'Password minimo 6 caratteri';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Le password non coincidono';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      await register(form.email, form.password, form.name, form.pharmacyName, form.pharmacyAddress, form.pharmacyPhone, form.pharmacyLat, form.pharmacyLng);
      navigate('/dashboard');
    } catch (err) {
      try {
        await login(form.email, form.password);
        navigate('/dashboard');
        return;
      } catch {}
      const msg = err.response?.data?.detail;
      if (msg === 'Email già registrata') {
        setErrors({ email: 'Questa email è già registrata' });
      } else {
        toast.error(msg || 'Errore di connessione. Riprova tra qualche secondo.');
      }
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
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <span className="text-sm">Torna alla home</span>
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center pb-4">
            <img src="/logo.png" alt="PharmaTrack" className="h-14 w-auto mx-auto mb-4" />
            <CardTitle className="text-2xl">Crea il tuo account</CardTitle>
            <CardDescription>Registrazione gratuita in pochi secondi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isGoogleConfigured() && (
              <>
                <GoogleSignInButton onCredential={handleGoogleCredential} label="Registrati con Google" />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground">oppure con email</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField id="name" label="Nome e cognome" placeholder="Mario Rossi" value={form.name} error={errors.name} onChange={setField('name')} required autoComplete="name" />
              <FormField id="pharmacyName" label="Nome farmacia" placeholder="Farmacia Centrale" value={form.pharmacyName} error={errors.pharmacyName} onChange={setField('pharmacyName')} autoComplete="organization" />

              <AddressAutocomplete
                id="pharmacyAddress"
                label="Indirizzo farmacia"
                placeholder="Via Rossi 119, Volla (NA)"
                value={form.pharmacyAddress}
                onChange={(val) => setForm((p) => ({ ...p, pharmacyAddress: val, pharmacyLat: null, pharmacyLng: null }))}
                onAddressSelect={(selection) => setForm((p) => ({ ...p, pharmacyAddress: selection.address, pharmacyLat: selection.lat, pharmacyLng: selection.lng }))}
              />

              {form.pharmacyLat && form.pharmacyLng && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Indirizzo verificato sulla mappa
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pharmacyPhone">Telefono farmacia</Label>
                <Input id="pharmacyPhone" placeholder="+39 081 1234567" value={form.pharmacyPhone} onChange={setField('pharmacyPhone')} className="h-12 text-base" autoComplete="tel" />
              </div>

              <FormField id="email" label="Email" type="email" placeholder="mario@farmacia.it" value={form.email} error={errors.email} onChange={setField('email')} required autoComplete="email" />
              <FormField id="password" label="Password" placeholder="Minimo 6 caratteri" value={form.password} error={errors.password} onChange={setField('password')} required showToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} autoComplete="new-password" />
              <FormField id="confirmPassword" label="Conferma password" placeholder="Ripeti la password" value={form.confirmPassword} error={errors.confirmPassword} onChange={setField('confirmPassword')} required showToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} autoComplete="new-password" />

              <Button type="submit" className="w-full btn-primary h-12 text-base font-semibold" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creazione in corso...</> : 'Crea account gratuito'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Hai già un account?{' '}
                <Link to="/login" className="text-primary hover:underline font-semibold">Accedi</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

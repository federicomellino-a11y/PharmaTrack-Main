import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Truck, Mail, Lock, ArrowLeft, AlertCircle } from 'lucide-react';

export default function DriverLogin() {
  const navigate = useNavigate();
  const { login, loading, driver } = useDriverAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (driver) {
      navigate('/driver');
    }
  }, [driver, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    
    try {
      await login(email, password);
      navigate('/driver');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090B]">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] grid-pattern flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back link */}
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna alla home
        </button>

        <Card className="bg-zinc-900/80 border-zinc-800 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/20 flex items-center justify-center mx-auto mb-4">
              <Truck className="w-8 h-8 text-teal-400" />
            </div>
            <CardTitle className="text-2xl text-white">Area Fattorini</CardTitle>
            <CardDescription>
              Accedi con le credenziali fornite dalla tua farmacia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              
              <div className="form-group">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tuaemail@esempio.com"
                    required
                    autoComplete="email"
                    className="pl-10 bg-zinc-800 border-zinc-700"
                    data-testid="driver-email-login"
                  />
                </div>
              </div>

              <div className="form-group">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="pl-10 bg-zinc-800 border-zinc-700"
                    data-testid="driver-password-login"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={submitting}
                className="w-full btn-glow bg-teal-500 hover:bg-teal-600 text-black font-semibold"
                data-testid="driver-login-submit"
              >
                {submitting ? 'Accesso in corso...' : 'Accedi'}
              </Button>
            </form>

            <p className="text-center text-zinc-500 text-sm mt-6">
              Non hai le credenziali? Chiedi alla farmacia di invitarti o rigenerare la password.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

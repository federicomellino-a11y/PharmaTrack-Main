import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { Button } from '../components/ui/button';
import { CheckCircle2, Clock, Package, Truck, MapPin, XCircle, RefreshCw } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Richiesta ricevuta', icon: Clock, states: [] },
  { id: 2, label: 'In preparazione', icon: Package, states: ['da_preparare', 'pending', 'pronta', 'assigned'] },
  { id: 3, label: 'In consegna', icon: Truck, states: ['picked_up', 'in_transit'] },
  { id: 4, label: 'Consegnata', icon: CheckCircle2, states: ['delivered_pending_confirmation', 'delivered'] },
];

const stepFromStatus = (status) => {
  for (let i = STEPS.length; i >= 1; i--) {
    if (STEPS[i - 1].states.includes(status)) return i;
  }
  return status === 'cancelled' ? 0 : 1;
};

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

export default function PublicTrackingPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/public/tracking/${token}`, { timeout: 15000 });
      setData(res.data);
      setError(null);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 410) setError('scaduto');
      else if (status === 404) setError('nonvalido');
      else if (!data) setError('errore');
    } finally {
      setRefreshing(false);
    }
  }, [token, data]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(() => fetchStatus(true), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <XCircle className="w-14 h-14 text-destructive" />
        {error === 'scaduto' ? (
          <>
            <p className="text-lg font-semibold">Link scaduto</p>
            <p className="text-sm text-muted-foreground">I link di tracking durano 72 ore. Contatta la farmacia per aggiornamenti.</p>
          </>
        ) : error === 'nonvalido' ? (
          <>
            <p className="text-lg font-semibold">Link non valido</p>
            <p className="text-sm text-muted-foreground">Controlla di avere aperto il link completo ricevuto dalla farmacia.</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">Impossibile caricare</p>
            <Button onClick={() => fetchStatus()}>Riprova</Button>
          </>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const currentStep = stepFromStatus(data.status);
  const cancelled = data.status === 'cancelled';

  return (
    <div className="min-h-screen bg-background p-6 max-w-md mx-auto flex flex-col">
      <div className="pt-8 pb-6 text-center">
        <MapPin className="w-10 h-10 text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Consegna per</p>
        <p className="text-2xl font-bold">{data.customer_first_name}</p>
        <p className="text-sm text-muted-foreground mt-1">{data.pharmacy_name}</p>
      </div>

      {cancelled ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
          <XCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="font-semibold">Consegna annullata</p>
          <p className="text-sm text-muted-foreground mt-1">Contatta la farmacia per informazioni.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5">
          <ol className="space-y-0">
            {STEPS.map((step, i) => {
              const done = currentStep > step.id || (currentStep === step.id && step.id === 4);
              const active = currentStep === step.id && step.id !== 4;
              const Icon = step.icon;
              return (
                <li key={step.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      done ? 'bg-primary text-primary-foreground' : active ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-6 ${currentStep > step.id ? 'bg-primary' : 'bg-border'}`} />
                    )}
                  </div>
                  <div className="pt-2 pb-8">
                    <p className={`font-medium ${done || active ? '' : 'text-muted-foreground'}`}>{step.label}</p>
                    {active && (
                      <p className="text-xs text-muted-foreground mt-0.5">In corso · aggiornato {fmtTime(data.updated_at)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground mt-6">
        Aggiornamento automatico ogni 30 secondi
        <br />Ultimo aggiornamento: {fmtTime(data.updated_at)}
      </p>
    </div>
  );
}

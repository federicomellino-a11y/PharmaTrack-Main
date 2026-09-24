import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Check, Crown } from 'lucide-react';
import { toast } from 'sonner';

const FREE = ['Fino a 2 fattorini', 'Archivio ultimi 30 giorni', 'Gestione clienti e consegne'];
const PRO = ['Fattorini illimitati', 'Archivio completo', 'Analytics ed export CSV', 'Bridge Winfarm', 'POD foto e firma', 'Notifiche SMS/WhatsApp/voce'];

export default function BillingUpgrade() {
  const [plans, setPlans] = useState(null); const [subscription, setSubscription] = useState(null); const [loading, setLoading] = useState(false);
  useEffect(() => { Promise.all([axios.get(`${API}/billing/plans`), axios.get(`${API}/billing/subscription`, { withCredentials: true })]).then(([p, s]) => { setPlans(p.data); setSubscription(s.data); }).catch(() => toast.error('Impossibile caricare i piani')); }, []);
  const active = ['active', 'trialing'].includes(subscription?.status);
  const upgrade = async () => { setLoading(true); try { const { data } = await axios.post(`${API}/billing/checkout`, { plan: 'pro' }, { withCredentials: true }); if (data.checkout_url) window.location.assign(data.checkout_url); } catch (err) { toast.error(err.response?.data?.detail || 'Checkout non disponibile'); } finally { setLoading(false); } };
  const item = (text) => <p key={text} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-emerald-500" />{text}</p>;
  return <Layout title="Upgrade Pro"><div className="mx-auto max-w-4xl space-y-6" data-testid="billing-upgrade-page"><div><h1 className="text-2xl font-bold">Scegli il piano giusto per la tua farmacia</h1><p className="text-muted-foreground">{plans?.trial_days || 14} giorni di prova inclusi sul piano Pro.</p></div><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Piano Free</CardTitle><Badge variant="outline">Gratis</Badge></CardHeader><CardContent className="space-y-3">{FREE.map(item)}</CardContent></Card><Card className="border-purple-500/50"><CardHeader><CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-purple-500" />Piano Pro</CardTitle><Badge className="w-fit">€{plans?.plans?.pro?.display_price_eur || 199}/mese</Badge></CardHeader><CardContent className="space-y-3">{PRO.map(item)}<Button className="mt-3 w-full" onClick={upgrade} disabled={loading || active}>{active ? 'Abbonamento attivo' : loading ? 'Apertura checkout…' : 'Upgrade a Pro'}</Button></CardContent></Card></div></div></Layout>;
}

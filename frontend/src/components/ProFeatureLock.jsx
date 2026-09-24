import React from 'react';
import { Lock, Crown } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { useNavigate } from 'react-router-dom';

export default function ProFeatureLock({ feature = 'Questa funzione', children }) {
  const navigate = useNavigate();
  return <div className="relative" data-testid="pro-feature-lock">
    <div aria-hidden="true" className="pointer-events-none select-none opacity-30 blur-[1px]">{children}</div>
    <Card className="absolute inset-0 flex items-center justify-center border-purple-500/40 bg-background/85 backdrop-blur-sm">
      <CardContent className="flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        <div className="rounded-full bg-purple-500/15 p-3 text-purple-500"><Lock className="h-6 w-6" /></div>
        <div className="flex items-center gap-2 font-semibold"><Crown className="h-4 w-4 text-purple-500" />Piano Pro richiesto</div>
        <p className="text-sm text-muted-foreground">{feature} è disponibile con il piano Pro.</p>
        <Button onClick={() => navigate('/pharmacy/billing-upgrade')}>Upgrade a Pro</Button>
      </CardContent>
    </Card>
  </div>;
}

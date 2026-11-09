import { vehicleLabels } from '@/lib/drivers';
import { Badge } from '../ui/badge';
import { BarChart3 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { CardContent } from '../ui/card';
import { Mail } from 'lucide-react';
import { Pencil } from 'lucide-react';
import { Phone } from 'lucide-react';
import { Star } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Trash2 } from 'lucide-react';
import { Truck } from 'lucide-react';

/* La scheda di un fattorino nella lista: stato, mezzo, consegne di oggi, interruttore attivo.

   Estratto da Drivers.jsx: riceve dallo stato della pagina solo cio' che usa.
*/
export default function FattorinoCard({ apriProfilo, driver, handleDelete, handleEdit, handleSetDefaultDriver, handleToggleActive, index, user }) {
  return (
 <Card
 key={driver.driver_id}
 className={` hover:border-primary/30 transition-colors animate-slide-up stagger-${(index % 5) + 1}`}
 >
 <CardContent className="p-5">
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-full flex items-center justify-center ${driver.is_active ? 'bg-primary/10' : 'bg-secondary'}`}>
 <Truck className={`w-5 h-5 ${driver.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
 </div>
 <div>
 <h3 className="font-semibold text-foreground">{driver.name}</h3>
 <Badge className={driver.is_active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-secondary text-muted-foreground'}>
 {driver.is_active ? 'Attivo' : 'Inattivo'}
 </Badge>
 </div>
 </div>
 <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleEdit(driver)}
 className="h-8 w-8 text-muted-foreground hover:text-foreground"
 data-testid={`edit-driver-${driver.driver_id}`}
 >
 <Pencil className="w-4 h-4"/>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleDelete(driver.driver_id)}
 className="h-8 w-8 text-muted-foreground hover:text-destructive"
 data-testid={`delete-driver-${driver.driver_id}`}
 >
 <Trash2 className="w-4 h-4"/>
 </Button>
 </div>
 </div>
 <div className="space-y-2 text-sm">
 <div className="flex items-center gap-2 text-muted-foreground">
 <Phone className="w-4 h-4"/>
 <span>{driver.phone}</span>
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <Mail className="w-4 h-4"/>
 <span className="truncate">{driver.email}</span>
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <Truck className="w-4 h-4"/>
 <span>{vehicleLabels[driver.vehicle_type] || driver.vehicle_type}</span>
 </div>
 </div>
 <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
 <Button
   variant="outline"
   size="sm"
   className="h-8 text-xs gap-1.5"
   onClick={() => apriProfilo(driver)}
   data-testid={`stats-driver-${driver.driver_id}`}
 >
   <BarChart3 className="w-3.5 h-3.5" />Statistiche
 </Button>
 <Button variant={user?.settings?.default_driver_id === driver.driver_id ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-xs"
   onClick={() => handleSetDefaultDriver(driver)}
   disabled={!driver.is_active}
   title={user?.settings?.default_driver_id === driver.driver_id ? 'Fattorino predefinito' : 'Imposta come predefinito'}
   data-testid={`default-driver-${driver.driver_id}`}>
   <Star className={`w-3 h-3 ${user?.settings?.default_driver_id === driver.driver_id ? 'fill-current' : ''}`} />
   {user?.settings?.default_driver_id === driver.driver_id ? 'Predefinito' : 'Predef.'}
 </Button>
 <div className="flex items-center gap-2">
   <span className="text-xs text-muted-foreground">Attivo</span>
   <Switch
     checked={driver.is_active}
     onCheckedChange={() => handleToggleActive(driver)}
     data-testid={`toggle-driver-${driver.driver_id}`}
   />
 </div>
 </div>
 </CardContent>
 </Card>

  );
}

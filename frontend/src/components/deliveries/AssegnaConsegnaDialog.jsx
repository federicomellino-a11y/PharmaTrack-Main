import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Truck, XCircle } from 'lucide-react';

/* Assegnazione a un fattorino.

   Estratto da Deliveries.jsx: stava nella stessa pagina della lista e degli altri
   quattro dialoghi. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function AssegnaConsegnaDialog({ assignDialogOpen, handleAssign, safeDrivers, selectedDelivery, setAssignDialogOpen }) {
  return (
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assegna Fattorino</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Button variant="outline" className="w-full justify-start text-muted-foreground h-11"
              onClick={() => handleAssign(null)}>
              <XCircle className="w-4 h-4 mr-2" />Rimuovi fattorino
            </Button>
            {safeDrivers.filter(d => d.is_active).map(d => (
              <Button key={d.driver_id} variant={selectedDelivery?.driver_id === d.driver_id ? 'default' : 'outline'}
                className={`w-full justify-start h-11 ${selectedDelivery?.driver_id === d.driver_id ? 'btn-primary' : ''}`}
                onClick={() => handleAssign(d.driver_id)}>
                <Truck className="w-4 h-4 mr-2" />
                <span className="font-medium">{d.name}</span>
                <span className="ml-auto text-xs opacity-70">{d.vehicle_type}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
  );
}

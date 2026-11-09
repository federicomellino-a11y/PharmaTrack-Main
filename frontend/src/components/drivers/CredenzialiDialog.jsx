import { Button } from '../ui/button';
import { Check } from 'lucide-react';
import { Copy } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { DialogContent } from '../ui/dialog';
import { DialogFooter } from '../ui/dialog';
import { DialogHeader } from '../ui/dialog';
import { DialogTitle } from '../ui/dialog';
import { KeyRound } from 'lucide-react';
import { Label } from '../ui/label';

/* CredenzialiDialog: estratto da Drivers.jsx.

   La pagina teneva dentro due dialoghi oltre alla griglia; qui il dialogo riceve
   dallo stato della pagina solo cio' che usa.
*/
export default function CredenzialiDialog({ copied, copyToClipboard, credentialsDialog, setCredentialsDialog }) {
  return (
 <Dialog open={!!credentialsDialog} onOpenChange={() => setCredentialsDialog(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-foreground">
 <KeyRound className="w-5 h-5 text-primary" />
 Fattorino creato!
 </DialogTitle>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <p className="text-sm text-muted-foreground">
 Condividi queste credenziali con <span className="text-foreground font-semibold">{credentialsDialog?.name}</span> per permettergli di accedere all'app.
 </p>
 <div className="space-y-2">
 <Label className="text-muted-foreground text-xs uppercase tracking-wide">Email</Label>
 <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
 <span className="flex-1 text-sm text-foreground font-mono">{credentialsDialog?.email}</span>
 <button type="button" onClick={() => copyToClipboard(credentialsDialog?.email, 'email')}
 className="text-muted-foreground hover:text-primary transition-colors">
 {copied === 'email' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-muted-foreground text-xs uppercase tracking-wide">Password</Label>
 <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
 <span className="flex-1 text-sm text-foreground font-mono">{credentialsDialog?.password}</span>
 <button type="button" onClick={() => copyToClipboard(credentialsDialog?.password, 'pwd')}
 className="text-muted-foreground hover:text-primary transition-colors">
 {copied === 'pwd' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 </div>
 <button type="button"
 onClick={() => copyToClipboard(`Email: ${credentialsDialog?.email}\nPassword: ${credentialsDialog?.password}`, 'all')}
 className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-teal-500/30 text-primary hover:bg-primary/10 transition-colors text-sm font-medium">
 {copied === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
 {copied === 'all' ? 'Copiato!' : 'Copia tutto'}
 </button>
 <p className="text-xs text-muted-foreground text-center">Salva queste credenziali — non potrai recuperare la password in seguito.</p>
 </div>
 <DialogFooter>
 <Button onClick={() => setCredentialsDialog(null)} className="btn-primary w-full">
 Fatto
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
  );
}

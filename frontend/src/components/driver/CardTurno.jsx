import { AlertCircle, Play, Square, Wallet } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

/**
 * Il turno del fattorino: apri, chiudi, totali del giro. Il conto sta nel
 * documento del turno, qui si mostra soltanto.
 */
export default function CardTurno({ shift, inCorso = false, onInizia, onChiudi }) {
  return (
    <Card className={`border ${shift ? (shift.status === 'open' ? 'border-teal-500/30 bg-teal-500/5' : 'border-amber-500/40 bg-amber-500/5') : 'border-zinc-800 bg-zinc-900/50'}`}>
    <CardContent className="p-4">
      {!shift ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl p-2.5 bg-zinc-800 text-zinc-300">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-white">Inizia turno</p>
              <p className="text-xs text-zinc-400 mt-0.5">Apri il giro per tracciare incassi e consegne</p>
            </div>
          </div>
          <Button
            onClick={onInizia}
            disabled={inCorso}
            className="bg-teal-500 hover:bg-teal-600 text-black font-semibold"
            data-testid="driver-start-shift-btn"
          >
            <Play className="w-4 h-4 mr-1.5" />Inizia
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`rounded-2xl p-2 ${shift.status === 'open' ? 'bg-teal-500/20 text-teal-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {shift.status === 'open' ? <Wallet className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-semibold text-white">
                  {shift.status === 'open' ? 'Turno aperto' : 'In attesa conferma farmacia'}
                </p>
                <p className="text-xs text-zinc-400">
                  Iniziato {new Date(shift.started_at).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})}
                </p>
              </div>
            </div>
            {shift.status === 'open' && (
              <Button
                onClick={onChiudi}
                disabled={inCorso}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                size="sm"
                data-testid="driver-close-shift-btn"
              >
                <Square className="w-4 h-4 mr-1.5" />Chiudi
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-zinc-900/70 p-2">
              <p className="text-lg font-bold text-white">{shift.totals?.delivered_count ?? 0}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Consegne</p>
            </div>
            <div className="rounded-lg bg-zinc-900/70 p-2">
              <p className="text-lg font-bold text-emerald-400">€{(shift.totals?.cash_total ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Contanti</p>
            </div>
            <div className="rounded-lg bg-zinc-900/70 p-2">
              <p className="text-lg font-bold text-sky-400">€{(shift.totals?.pos_total ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">POS</p>
            </div>
          </div>
          {shift.status === 'closed_by_driver' && (
            <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2">
              Hai chiuso il turno dichiarando €{(shift.driver_declared_cash ?? 0).toFixed(2)}. Aspetta la conferma della farmacia.
            </p>
          )}
        </div>
      )}
    </CardContent>
  </Card>

  );
}

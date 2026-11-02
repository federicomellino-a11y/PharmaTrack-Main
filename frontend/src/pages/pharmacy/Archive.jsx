import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useArchiveQuery } from '@/hooks/queries';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Search, Package, MapPin, Phone, Calendar,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  RotateCcw, Trash2, Ban
} from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';


export default function ArchivePage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const { data: archiveData, isLoading: loading } = useArchiveQuery(page, 20);
  const deliveries = ensureArray(archiveData?.deliveries);
  const totalPages = archiveData?.pages || 1;
  const fetchArchive = () => queryClient.invalidateQueries({ queryKey: ['archive'] });

  // Un'azione sull'archivio tocca anche consegne, KPI, turni e clienti:
  // se non si invalidano tutte, la home resta con i numeri di prima.
  const invalidaTutto = () => queryClient.invalidateQueries({
    predicate: (q) => ['archive', 'deliveries', 'statistics', 'shifts', 'customers'].includes(q.queryKey[0]),
  });

  const [azione, setAzione] = useState(null); // { tipo: 'restore'|'cancel'|'delete', delivery }
  const [motivo, setMotivo] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const eseguiAzione = async () => {
    if (!azione) return;
    setInCorso(true);
    const { tipo, delivery } = azione;
    try {
      if (tipo === 'restore') {
        await axios.post(`${API}/deliveries/${delivery.delivery_id}/restore`, {}, { withCredentials: true });
        toast.success('Consegna ripristinata: torna nel giro del fattorino');
      } else if (tipo === 'cancel') {
        await axios.post(`${API}/deliveries/${delivery.delivery_id}/cancel`,
          { reason: motivo.trim() || null }, { withCredentials: true });
        toast.success('Consegna annullata: esce da report e statistiche');
      } else {
        await axios.delete(`${API}/deliveries/${delivery.delivery_id}`, { withCredentials: true });
        toast.success('Consegna eliminata definitivamente');
      }
      setAzione(null);
      setMotivo('');
      await invalidaTutto();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Operazione non riuscita');
    } finally {
      setInCorso(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const statusLabels = {
    delivered: 'Consegnata',
    delivered_pending_confirmation: 'Da confermare',
    cancelled: 'Annullata',
    not_delivered: 'Non consegnata',
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const safeDeliveries = ensureArray(deliveries);

  const filteredDeliveries = safeDeliveries.filter(d =>
    (d.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.customer_address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.notes?.toLowerCase()?.includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Layout title="Archivio">
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Archivio">
      <div className="space-y-6" data-testid="archive-page">

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Archivio Consegne</h1>
            <p className="text-muted-foreground">Storico delle consegne completate e annullate</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca nell'archivio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="search-archive"
          />
        </div>

        {filteredDeliveries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Nessuna consegna trovata' : 'Archivio vuoto'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {filteredDeliveries.map((delivery, index) => (
                <Card
                  key={delivery.delivery_id}
                  className={`animate-slide-up stagger-${(index % 5) + 1}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">

                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        delivery.status === 'delivered'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-destructive/10 text-destructive'
                      }`}>
                        {delivery.status === 'delivered' ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <XCircle className="w-6 h-6" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{delivery.customer_name}</h3>
                          <Badge className={`status-${delivery.status}`}>
                            {statusLabels[delivery.status] || delivery.status}
                          </Badge>
                          {delivery.marker === 'ripristinata' && (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-500/40" data-testid="marker-ripristinata">
                              Ripristinata
                            </Badge>
                          )}
                          {delivery.marker === 'annullata' && delivery.cancellation_reason && (
                            <span className="text-xs text-muted-foreground" data-testid="cancel-reason">
                              motivo: {delivery.cancellation_reason}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {delivery.customer_address}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {delivery.customer_phone}
                          </span>
                        </div>
                        {delivery.notes && (
                          <p className="text-sm text-muted-foreground/80 mt-1">
                            <strong className="text-foreground/70">Note:</strong> {delivery.notes}
                          </p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
                          <Calendar className="w-4 h-4" />
                          {formatDate(delivery.actual_delivery || delivery.updated_at)}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Creata: {formatDate(delivery.created_at)}
                        </p>
                        <div className="flex gap-2 justify-end mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAzione({ tipo: 'restore', delivery })}
                            data-testid={`restore-${delivery.delivery_id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />Ripristina
                          </Button>
                          {delivery.status === 'cancelled' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setAzione({ tipo: 'delete', delivery })}
                              data-testid={`delete-${delivery.delivery_id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" />Elimina
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setAzione({ tipo: 'cancel', delivery })}
                              data-testid={`cancel-${delivery.delivery_id}`}
                            >
                              <Ban className="w-3.5 h-3.5 mr-1" />Annulla
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-muted-foreground px-4">
                  Pagina {page} di {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}

      <AlertDialog open={!!azione} onOpenChange={(open) => { if (!open) { setAzione(null); setMotivo(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {azione?.tipo === 'restore' && 'Ripristinare la consegna?'}
              {azione?.tipo === 'cancel' && 'Annullare la consegna?'}
              {azione?.tipo === 'delete' && 'Eliminare definitivamente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {azione?.tipo === 'restore' &&
                `"${azione?.delivery?.customer_name}" torna in lavorazione con stato "pronta" ed esce dai report della giornata finche' non viene riconsegnata.`}
              {azione?.tipo === 'cancel' &&
                `"${azione?.delivery?.customer_name}" resta in archivio con l'etichetta Annullata, esce da report e statistiche e il fattorino viene avvisato.`}
              {azione?.tipo === 'delete' &&
                `"${azione?.delivery?.customer_name}" sparisce da ogni elenco. L'operazione non si puo' annullare.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {azione?.tipo === 'cancel' && (
            <Input
              placeholder="Motivo (facoltativo): cliente assente, ordine sbagliato..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inCorso}>Indietro</AlertDialogCancel>
            <AlertDialogAction
              data-testid="conferma-azione"
              disabled={inCorso}
              onClick={(e) => { e.preventDefault(); eseguiAzione(); }}
              className={azione?.tipo === 'restore' ? '' : 'bg-destructive hover:bg-destructive/90'}
            >
              {inCorso ? 'Attendere...' : azione?.tipo === 'restore' ? 'Ripristina' : azione?.tipo === 'cancel' ? 'Annulla consegna' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Layout>
  );
}

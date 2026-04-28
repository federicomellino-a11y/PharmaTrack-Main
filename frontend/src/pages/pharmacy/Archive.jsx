import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Search, Package, MapPin, Phone, Calendar,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';


export default function ArchivePage() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchArchive();
  }, [page]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const fetchArchive = async () => {
    try {
      const response = await axios.get(`${API}/archive?page=${page}&limit=20`, {
        withCredentials: true
      });
      setDeliveries(ensureArray(response.data?.deliveries));
      setTotalPages(response.data.pages);
    } catch {
      toast.error('Errore nel caricamento archivio');
    } finally {
      setLoading(false);
    }
  };

  const statusLabels = {
    delivered: 'Consegnata',
    cancelled: 'Annullata'
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
                            {statusLabels[delivery.status]}
                          </Badge>
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
      </div>
    </Layout>
  );
}

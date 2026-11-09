import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { API } from '@/lib/config'
import { chiavi, letture } from '@/lib/api'
import {
  ShieldCheck,
  RefreshCw,
  Users,
  Truck,
  Package,
  Database,
  Mail,
  Building2,
  Trash2,
  LogOut,
  Search,
  Activity,
  Eye,
  Power,
  Server,
  Bell,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  History,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import DettaglioAccountDialog from '../../components/admin/DettaglioAccountDialog'
import { toast } from 'sonner'
import { ensureArray, ensureObject } from '@/lib/collections'
import {
  useAdminOverviewQuery,
  useAdminUsersQuery,
  useAdminDatabaseStatsQuery,
  useAdminDatabaseHealthQuery,
} from '@/hooks/queries'

import { formatDateTimeLong } from '@/lib/format';

export default function AdminDashboardPage() {
  const { admin, logout } = useAdminAuth()
  const queryClient = useQueryClient()
  const overviewQuery = useAdminOverviewQuery()
  const usersQuery = useAdminUsersQuery()
  const databaseStatsQuery = useAdminDatabaseStatsQuery()
  const databaseHealthQuery = useAdminDatabaseHealthQuery()

  const overview = ensureObject(overviewQuery.data)
  const databaseStats = ensureObject(databaseStatsQuery.data)
  const databaseHealth = ensureObject(databaseHealthQuery.data)
  const users = ensureArray(usersQuery.data)

  const adminQueries = [overviewQuery, usersQuery, databaseStatsQuery, databaseHealthQuery]
  const loading = adminQueries.some((query) => query.isLoading)
  const refreshing = adminQueries.some((query) => query.isFetching)
  const loadError = adminQueries.find((query) => query.error)?.error

  const [search, setSearch] = useState('')
  const [deletingUserId, setDeletingUserId] = useState(null)
  const [togglingUserId, setTogglingUserId] = useState(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserDetails, setSelectedUserDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Una sola invalidazione per tutte e quattro le letture: la cache condivisa
  // sostituisce il vecchio fetch manuale con quattro axios in parallelo.
  const fetchData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  useEffect(() => {
    if (!loadError) return
    toast.error(loadError.response?.data?.detail || 'Errore caricamento console admin')
  }, [loadError])

  const filteredUsers = useMemo(() => {
    const safeUsers = ensureArray(users)
    const term = search.trim().toLowerCase()
    if (!term) return safeUsers
    return safeUsers.filter((user) =>
      [user.name, user.email, user.pharmacy_name, user.pharmacy_phone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term)),
    )
  }, [search, users])

  const openUserDetails = async (user) => {
    setSelectedUser(user)
    setSelectedUserDetails(null)
    setDetailsLoading(true)
    setDetailsOpen(true)

    try {
      const response = await queryClient.fetchQuery({
        queryKey: chiavi.adminUtente(user.user_id),
        queryFn: letture.adminUtente(user.user_id),
      })
      setSelectedUserDetails(ensureObject(response))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore caricamento dettagli utente')
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleDeleteUser = async (user) => {
    const confirmation = window.prompt(`Per eliminare ${user.email} scrivi ELIMINA`)
    if (confirmation !== 'ELIMINA') return
    setDeletingUserId(user.user_id)

    try {
      await axios.delete(`${API}/admin/users/${user.user_id}`, { withCredentials: true })
      toast.success('Utente eliminato con successo')
      if (selectedUser?.user_id === user.user_id) {
        setDetailsOpen(false)
        setSelectedUser(null)
        setSelectedUserDetails(null)
      }
      await fetchData()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore eliminazione utente')
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleToggleUserStatus = async (user) => {
    const nextStatus = !(user.is_active ?? true)
    setTogglingUserId(user.user_id)

    try {
      const response = await axios.put(
        `${API}/admin/users/${user.user_id}/status`,
        { is_active: nextStatus },
        { withCredentials: true },
      )
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      if (selectedUser?.user_id === user.user_id && selectedUserDetails?.user) {
        setSelectedUserDetails((prev) => prev ? ({ ...prev, user: response.data }) : prev)
      }
      toast.success(nextStatus ? 'Account riattivato' : 'Account disattivato e sessioni revocate')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore aggiornamento stato account')
    } finally {
      setTogglingUserId(null)
    }
  }

  const handleCleanupSessions = async () => {
    setCleanupRunning(true)
    try {
      const response = await axios.post(`${API}/admin/database/cleanup-sessions`, {}, { withCredentials: true })
      toast.success(response.data?.message || 'Pulizia sessioni completata')
      await fetchData()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore durante la pulizia sessioni')
    } finally {
      setCleanupRunning(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="spinner" /></div>
  }

  const summary = overview?.summary || {}
  const collectionCards = ensureObject(databaseStats?.collections)
  const sessionCards = ensureObject(databaseStats?.sessions)
  const latestUsers = ensureArray(overview?.latest_users)
  const detailRecentDeliveries = ensureArray(selectedUserDetails?.recent_deliveries)
  const detailDrivers = ensureArray(selectedUserDetails?.drivers)
  const detailRecentNotifications = ensureArray(selectedUserDetails?.recent_notifications)
  const selectedDetailUser = selectedUserDetails?.user || selectedUser

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Console super admin</h1>
              <p className="text-sm text-muted-foreground">{admin?.name} · {admin?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => fetchData()} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button variant="ghost" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
          {[
            { label: 'Farmacie iscritte', value: summary.users || 0, icon: Users },
            { label: 'Fattorini', value: summary.drivers || 0, icon: Truck },
            { label: 'Clienti', value: summary.customers || 0, icon: Building2 },
            { label: 'Consegne', value: summary.deliveries || 0, icon: Package },
            { label: 'Sessioni attive', value: summary.active_sessions || 0, icon: Database },
          ].map((item) => (
            <Card key={item.label} className="shadow-sm border-primary/10">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-3xl font-black">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full sm:w-auto grid-cols-3">
            <TabsTrigger value="users">Utenti</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="activity">Attività</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>Gestione farmacie</CardTitle>
                    <CardDescription>Ricerca, ispezione dettagliata, attivazione/disattivazione ed eliminazione account.</CardDescription>
                  </div>
                  <div className="relative w-full lg:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per nome, farmacia, email o telefono" className="pl-9" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredUsers.length === 0 ? (
                  <div className="py-14 text-center text-muted-foreground">Nessun iscritto trovato.</div>
                ) : filteredUsers.map((user) => {
                  const active = user.is_active ?? true
                  return (
                    <div key={user.user_id} className="rounded-3xl border border-border bg-card/70 p-4 flex flex-col xl:flex-row xl:items-center gap-4 xl:justify-between shadow-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{user.name}</p>
                          <Badge variant="outline">{user.role || 'pharmacy'}</Badge>
                          <Badge variant={active ? 'secondary' : 'destructive'}>{active ? 'Attivo' : 'Disattivato'}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-1">{user.email}</p>
                        <p className="text-sm mt-1">{user.pharmacy_name || 'Farmacia senza nome'}{user.pharmacy_phone ? ` · ${user.pharmacy_phone}` : ''}</p>
                        <p className="text-xs text-muted-foreground mt-1">Creato il {formatDateTimeLong(user.created_at)}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center min-w-[210px]">
                        <div className="rounded-2xl bg-secondary/50 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Clienti</p>
                          <p className="font-bold">{user.stats?.customers || 0}</p>
                        </div>
                        <div className="rounded-2xl bg-secondary/50 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Fattorini</p>
                          <p className="font-bold">{user.stats?.drivers || 0}</p>
                        </div>
                        <div className="rounded-2xl bg-secondary/50 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Consegne</p>
                          <p className="font-bold">{user.stats?.deliveries || 0}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button variant="outline" onClick={() => openUserDetails(user)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Dettagli
                        </Button>
                        <Button variant="outline" onClick={() => handleToggleUserStatus(user)} disabled={togglingUserId === user.user_id}>
                          <Power className="w-4 h-4 mr-2" />
                          {togglingUserId === user.user_id ? 'Aggiorno...' : active ? 'Disattiva' : 'Riattiva'}
                        </Button>
                        <Button variant="outline" asChild>
                          <a href={`mailto:${user.email}`}>
                            <Mail className="w-4 h-4 mr-2" />
                            Email
                          </a>
                        </Button>
                        <Button variant="destructive" onClick={() => handleDeleteUser(user)} disabled={deletingUserId === user.user_id}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          {deletingUserId === user.user_id ? 'Elimino...' : 'Elimina'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="database" className="space-y-6">
            <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Collezioni database</CardTitle>
                  <CardDescription>Distribuzione documenti salvati e conteggio sessioni correnti.</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(collectionCards).map(([key, value]) => (
                    <div key={key} className="rounded-2xl border border-border px-4 py-3 bg-secondary/30 flex items-center justify-between gap-3">
                      <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{value}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manutenzione</CardTitle>
                  <CardDescription>Controllo stato database e pulizia sessioni orfane o scadute.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      Database {databaseHealth?.status === 'ok' ? 'raggiungibile' : 'da verificare'}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">DB: {databaseHealth?.database || '-'}</p>
                    <p className="text-sm text-muted-foreground">Aggiornato: {formatDateTimeLong(databaseHealth?.generated_at)}</p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    {Object.entries(sessionCards).map(([key, value]) => (
                      <div key={key} className="rounded-2xl bg-secondary/50 px-3 py-3 text-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                        <p className="text-xl font-black mt-1">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-border p-4 bg-card/70 space-y-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <Server className="w-4 h-4 text-primary" />
                      Connessioni realtime
                    </div>
                    <p className="text-sm text-muted-foreground">Farmacie online: {databaseHealth?.active_connections?.pharmacy || 0}</p>
                    <p className="text-sm text-muted-foreground">Fattorini online: {databaseHealth?.active_connections?.driver || 0}</p>
                  </div>

                  <Button className="w-full btn-primary" onClick={handleCleanupSessions} disabled={cleanupRunning}>
                    <History className="w-4 h-4 mr-2" />
                    {cleanupRunning ? 'Pulizia in corso...' : 'Pulisci sessioni scadute/orfane'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <div className="grid xl:grid-cols-[1.2fr_1fr] gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ultime iscrizioni</CardTitle>
                  <CardDescription>Snapshot rapido degli account creati più di recente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {latestUsers.map((user) => (
                    <div key={user.user_id} className="rounded-2xl border border-border p-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{user.pharmacy_name || user.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDateTimeLong(user.created_at)}</p>
                      </div>
                      <Badge variant={(user.is_active ?? true) ? 'secondary' : 'destructive'}>
                        {(user.is_active ?? true) ? 'Attivo' : 'Disattivato'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Stato piattaforma</CardTitle>
                  <CardDescription>Indicatori rapidi per comprendere lo stato operativo globale.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    {
                      label: 'Database',
                      value: databaseHealth?.status === 'ok' ? 'Operativo' : 'Da verificare',
                      icon: Activity,
                      tone: 'text-emerald-600',
                    },
                    {
                      label: 'Collezioni indicizzate',
                      value: databaseHealth?.collections?.length || 0,
                      icon: Database,
                      tone: 'text-primary',
                    },
                    {
                      label: 'Ultimo controllo',
                      value: formatDateTimeLong(databaseHealth?.generated_at),
                      icon: Clock3,
                      tone: 'text-muted-foreground',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">{item.label}</p>
                        <p className="font-semibold mt-1">{item.value}</p>
                      </div>
                      <item.icon className={`w-5 h-5 ${item.tone}`} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <DettaglioAccountDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        utente={selectedDetailUser}
        dettagli={selectedUserDetails}
        consegneRecenti={detailRecentDeliveries}
        fattorini={detailDrivers}
        notifiche={detailRecentNotifications}
        caricamento={detailsLoading}
      />
    </div>
  )
}

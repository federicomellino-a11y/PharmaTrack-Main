import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDriversQuery } from '@/hooks/queries';
import useFattorini from '@/hooks/useFattorini';
import { ensureArray } from '@/lib/collections';
import { useAuth } from '../../contexts/AuthContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, Search, Truck } from 'lucide-react';
import FattorinoCard from '../../components/drivers/FattorinoCard';
import AutistaDialog from '../../components/drivers/AutistaDialog';
import CredenzialiDialog from '../../components/drivers/CredenzialiDialog';
import ProfiloFattorinoDialog from '../../components/drivers/ProfiloFattorinoDialog';

export default function DriversPage() {
 const { user, updateProfile } = useAuth();
 const queryClient = useQueryClient();
 const { data: driversData = [], isLoading: loading } = useDriversQuery();
 const drivers = ensureArray(driversData);
  const {
    apriProfilo,
    chiudiProfilo,
    copied,
    copyToClipboard,
    credentialsDialog,
    dialogOpen,
    editingDriver,
    filteredDrivers,
    formData,
    handleDelete,
    handleEdit,
    handleSetDefaultDriver,
    handleSubmit,
    handleToggleActive,
    openNewDialog,
    profileDriver,
    profileLoading,
    profileStats,
    safeDrivers,
    searchTerm,
    setCredentialsDialog,
    setDialogOpen,
    setFormData,
    setSearchTerm,
    setShowPassword,
    showPassword,
  } = useFattorini({ drivers, user, updateProfile, queryClient });

 if (loading) {
 return (
 <Layout title="Fattorini">
 <div className="flex items-center justify-center h-64">
 <div className="spinner"></div>
 </div>
 </Layout>
 );
 }

 return (
 <Layout title="Fattorini">
 <div className="space-y-6"data-testid="drivers-page">
 {/* Header */}
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-foreground">Anagrafica Fattorini</h1>
 <p className="text-muted-foreground">{safeDrivers.length} fattorini registrati</p>
 </div>
 <Button
 onClick={openNewDialog}
 className="btn-primary"
 data-testid="add-driver-btn"
 >
 <Plus className="w-4 h-4 mr-2"/>
 Nuovo Fattorino
 </Button>
 </div>

 {/* Search */}
 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 placeholder="Cerca per nome, email o telefono..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-10"
 data-testid="search-drivers"
 />
 </div>

 {/* Drivers Grid */}
 {filteredDrivers.length === 0 ? (
 <Card className="">
 <CardContent className="py-12 text-center">
 <Truck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4"/>
 <p className="text-muted-foreground">
 {searchTerm ? 'Nessun fattorino trovato' : 'Nessun fattorino registrato'}
 </p>
 {!searchTerm && (
 <Button
 onClick={openNewDialog}
 variant="outline"
 className="mt-4"
 >
 Aggiungi il primo fattorino
 </Button>
 )}
 </CardContent>
 </Card>
 ) : (
 <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
 {filteredDrivers.map((driver, index) => (
      <FattorinoCard
        {...{
        apriProfilo,
        driver,
        handleDelete,
        handleEdit,
        handleSetDefaultDriver,
        handleToggleActive,
        index,
        user,
        }}
      />
 ))}
 </div>
 )}

 {/* Dialog */}
      <AutistaDialog
        {...{
        dialogOpen,
        editingDriver,
        formData,
        handleSubmit,
        setDialogOpen,
        setFormData,
        setShowPassword,
        showPassword,
        }}
      />
 </div>

 {/* Credentials Dialog (shown after creating a new driver) */}
      <CredenzialiDialog
        {...{
        copied,
        copyToClipboard,
        credentialsDialog,
        setCredentialsDialog,
        }}
      />

 {/* Profile Driver Dialog (stats) */}
      <ProfiloFattorinoDialog
        {...{
        handleEdit,
        profileDriver,
        profileLoading,
        profileStats,
        chiudiProfilo,
        }}
      />

 </Layout>
 );
}

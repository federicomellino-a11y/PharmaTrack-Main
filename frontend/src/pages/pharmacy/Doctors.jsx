import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import {
 Search, Plus, Pencil, Trash2, Stethoscope, Phone, Mail, MapPin, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray, ensureObject } from '@/lib/collections';


const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export default function DoctorsPage() {
 const [doctors, setDoctors] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editing, setEditing] = useState(null);
 const [formData, setFormData] = useState({
 name: '', specialty: '', phone: '', email: '', address: '', notes: '',
 schedule: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }
 });

 useEffect(() => { fetchDoctors(); }, []);

 const fetchDoctors = async () => {
 try {
 const response = await axios.get(`${API}/doctors`, { withCredentials: true });
 setDoctors(ensureArray(response.data));
 } catch (err) {
 toast.error('Errore nel caricamento');
 } finally {
 setLoading(false);
 }
 };

 const handleSubmit = async (e) => {
 e.preventDefault();
 try {
 if (editing) {
 await axios.put(`${API}/doctors/${editing.doctor_id}`, formData, { withCredentials: true });
 toast.success('Medico aggiornato');
 } else {
 await axios.post(`${API}/doctors`, formData, { withCredentials: true });
 toast.success('Medico aggiunto');
 }
 setDialogOpen(false);
 resetForm();
 fetchDoctors();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleDelete = async (id) => {
 if (!window.confirm('Eliminare questo medico?')) return;
 try {
 await axios.delete(`${API}/doctors/${id}`, { withCredentials: true });
 toast.success('Medico eliminato');
 fetchDoctors();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleEdit = (doc) => {
 setEditing(doc);
 setFormData({
 name: doc.name, specialty: doc.specialty, phone: doc.phone || '',
 email: doc.email || '', address: doc.address || '', notes: doc.notes || '',
 schedule: doc.schedule || { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }
 });
 setDialogOpen(true);
 };

 const resetForm = () => {
 setEditing(null);
 setFormData({
 name: '', specialty: '', phone: '', email: '', address: '', notes: '',
 schedule: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' }
 });
 };

 const safeDoctors = ensureArray(doctors);

 const filtered = safeDoctors.filter(d =>
 (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 (d.specialty || '').toLowerCase().includes(searchTerm.toLowerCase())
 );

 if (loading) {
 return <Layout title="Medici"><div className="flex items-center justify-center h-64"><div className="spinner"></div></div></Layout>;
 }

 return (
 <Layout title="Medici">
 <div className="space-y-6"data-testid="doctors-page">
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold">Anagrafica Medici</h1>
 <p className="text-muted-foreground">{safeDoctors.length} medici registrati</p>
 </div>
 <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="btn-primary">
 <Plus className="w-4 h-4 mr-2"/> Nuovo Medico
 </Button>
 </div>

 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input placeholder="Cerca medico..."value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10"/>
 </div>

 {filtered.length === 0 ? (
 <Card><CardContent className="py-12 text-center">
 <Stethoscope className="w-12 h-12 mx-auto mb-4 opacity-50"/>
 <p className="text-muted-foreground">{searchTerm ? 'Nessun risultato' : 'Nessun medico registrato'}</p>
 </CardContent></Card>
 ) : (
 <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
 {filtered.map((doc, i) => (
 <Card key={doc.doctor_id} className={`card-interactive animate-slide-up stagger-${i % 5}`}>
 <CardContent className="p-5">
 <div className="flex items-start justify-between mb-3">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
 <Stethoscope className="w-6 h-6 text-primary"/>
 </div>
 <div>
 <h3 className="font-semibold">{doc.name}</h3>
 <p className="text-sm text-primary">{doc.specialty}</p>
 </div>
 </div>
 <div className="flex gap-1">
 <Button variant="ghost"size="icon"onClick={() => handleEdit(doc)} className="h-8 w-8">
 <Pencil className="w-4 h-4"/>
 </Button>
 <Button variant="ghost"size="icon"onClick={() => handleDelete(doc.doctor_id)} className="h-8 w-8 text-destructive">
 <Trash2 className="w-4 h-4"/>
 </Button>
 </div>
 </div>
 <div className="space-y-2 text-sm">
 {doc.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4"/>{doc.phone}</p>}
 {doc.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4"/>{doc.email}</p>}
 {doc.address && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4"/>{doc.address}</p>}
 </div>
 {Object.values(ensureObject(doc.schedule)).some(v => v) && (
 <div className="mt-3 pt-3 border-t border-border">
 <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2"><Clock className="w-3 h-3"/> Orari</p>
 <div className="flex flex-wrap gap-1">
 {Object.entries(ensureObject(doc.schedule)).map(([day, time]) => time && (
 <span key={day} className="text-xs px-2 py-1 rounded bg-secondary">{day.substring(0,3)}: {time}</span>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 )}

 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"aria-describedby="doctor-dialog-desc">
 <DialogHeader>
 <DialogTitle>{editing ? 'Modifica Medico' : 'Nuovo Medico'}</DialogTitle>
 <p id="doctor-dialog-desc"className="text-sm text-muted-foreground">
 {editing ? 'Modifica i dati del medico.' : 'Aggiungi un nuovo medico alla tua rubrica.'}
 </p>
 </DialogHeader>
 <form onSubmit={handleSubmit}>
 <div className="space-y-4 py-4">
 <div className="grid grid-cols-2 gap-4">
 <div><Label>Nome *</Label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required /></div>
 <div><Label>Specialità *</Label><Input value={formData.specialty} onChange={(e) => setFormData({...formData, specialty: e.target.value})} required placeholder="Es. Cardiologo"/></div>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div><Label>Telefono</Label><Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} /></div>
 <div><Label>Email</Label><Input type="email"value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
 </div>
 <div><Label>Indirizzo</Label><Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} /></div>
 <div>
 <Label>Orari Settimanali</Label>
 <div className="grid grid-cols-2 gap-2 mt-2">
 {[['mon','Lun'],['tue','Mar'],['wed','Mer'],['thu','Gio'],['fri','Ven'],['sat','Sab'],['sun','Dom']].map(([key, label]) => (
 <div key={key} className="flex items-center gap-2">
 <span className="w-8 text-xs text-muted-foreground">{label}</span>
 <Input
 placeholder="09:00-18:00"
 value={formData.schedule[key]}
 onChange={(e) => setFormData({...formData, schedule: {...formData.schedule, [key]: e.target.value}})}
 className="text-sm"
 />
 </div>
 ))}
 </div>
 </div>
 <div><Label>Note</Label><Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} /></div>
 </div>
 <DialogFooter>
 <Button type="button"variant="outline"onClick={() => setDialogOpen(false)}>Annulla</Button>
 <Button type="submit">{editing ? 'Salva' : 'Aggiungi'}</Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 </Layout>
 );
}

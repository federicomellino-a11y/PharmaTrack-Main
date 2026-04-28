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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import {
 Search, Plus, Trash2, Phone, Copy, ExternalLink, Ambulance, Building2, Stethoscope, HelpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';


const CATEGORIES = [
 { value: 'emergency', label: 'Emergenza', icon: Ambulance, color: 'bg-red-500/10 text-red-500 border-red-500/30' },
 { value: 'hospital', label: 'Ospedale', icon: Building2, color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
 { value: 'specialist', label: 'Specialista', icon: Stethoscope, color: 'bg-purple-500/10 text-purple-500 border-purple-500/30' },
 { value: 'general', label: 'Generale', icon: HelpCircle, color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30' }
];

export default function UsefulNumbersPage() {
 const [numbers, setNumbers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [dialogOpen, setDialogOpen] = useState(false);
 const [formData, setFormData] = useState({ name: '', phone: '', category: 'general', notes: '' });

 useEffect(() => { fetchNumbers(); }, []);

 const fetchNumbers = async () => {
 try {
 const response = await axios.get(`${API}/useful-numbers`, { withCredentials: true });
 setNumbers(ensureArray(response.data));
 } catch (err) {
 toast.error('Errore nel caricamento');
 } finally {
 setLoading(false);
 }
 };

 const handleSubmit = async (e) => {
 e.preventDefault();
 try {
 await axios.post(`${API}/useful-numbers`, formData, { withCredentials: true });
 toast.success('Numero aggiunto');
 setDialogOpen(false);
 setFormData({ name: '', phone: '', category: 'general', notes: '' });
 fetchNumbers();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleDelete = async (id) => {
 if (!window.confirm('Eliminare questo numero?')) return;
 try {
 await axios.delete(`${API}/useful-numbers/${id}`, { withCredentials: true });
 toast.success('Numero eliminato');
 fetchNumbers();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const copyToClipboard = (phone) => {
 navigator.clipboard.writeText(phone);
 toast.success('Numero copiato!');
 };

 const getCategoryInfo = (cat) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[3];

 const safeNumbers = ensureArray(numbers);

 const filtered = safeNumbers.filter(n =>
 (n.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 n.phone.includes(searchTerm)
 );

 const groupedNumbers = CATEGORIES.reduce((acc, cat) => {
 acc[cat.value] = filtered.filter(n => n.category === cat.value);
 return acc;
 }, {});

 if (loading) {
 return <Layout title="Numeri Utili"><div className="flex items-center justify-center h-64"><div className="spinner"></div></div></Layout>;
 }

 return (
 <Layout title="Numeri Utili">
 <div className="space-y-6"data-testid="useful-numbers-page">
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold">Numeri Utili</h1>
 <p className="text-muted-foreground">{safeNumbers.length} numeri salvati</p>
 </div>
 <Button onClick={() => setDialogOpen(true)} className="btn-primary"data-testid="add-number-btn">
 <Plus className="w-4 h-4 mr-2"/> Nuovo Numero
 </Button>
 </div>

 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 placeholder="Cerca numero o nome..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-10"
 data-testid="search-numbers"
 />
 </div>

 {filtered.length === 0 ? (
 <Card><CardContent className="py-12 text-center">
 <Phone className="w-12 h-12 mx-auto mb-4 opacity-50"/>
 <p className="text-muted-foreground">{searchTerm ? 'Nessun risultato' : 'Nessun numero salvato'}</p>
 <Button onClick={() => setDialogOpen(true)} variant="outline"className="mt-4">
 <Plus className="w-4 h-4 mr-2"/> Aggiungi il primo numero
 </Button>
 </CardContent></Card>
 ) : (
 <div className="space-y-6">
 {CATEGORIES.map(cat => {
 const catNumbers = ensureArray(groupedNumbers[cat.value]);
 if (catNumbers.length === 0) return null;
 const Icon = cat.icon;
 return (
 <div key={cat.value}>
 <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
 <Icon className="w-4 h-4"/>
 {cat.label} ({catNumbers.length})
 </h3>
 <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {catNumbers.map((num, i) => {
 const catInfo = getCategoryInfo(num.category);
 return (
 <Card key={num.number_id} className={`card-interactive animate-slide-up stagger-${i % 5}`}>
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-2">
 <div className="flex-1">
 <h3 className="font-semibold">{num.name}</h3>
 <Badge variant="outline"className={`mt-1 text-xs ${catInfo.color}`}>
 {catInfo.label}
 </Badge>
 </div>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleDelete(num.number_id)}
 className="h-8 w-8 text-destructive"
 data-testid={`delete-${num.number_id}`}
 >
 <Trash2 className="w-4 h-4"/>
 </Button>
 </div>
 <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 mt-3">
 <Phone className="w-4 h-4 text-primary"/>
 <span className="font-mono text-lg font-semibold flex-1">{num.phone}</span>
 <Button variant="ghost"size="icon"className="h-8 w-8"onClick={() => copyToClipboard(num.phone)}>
 <Copy className="w-4 h-4"/>
 </Button>
 <Button variant="ghost"size="icon"className="h-8 w-8"asChild>
 <a href={`tel:${num.phone}`}><ExternalLink className="w-4 h-4"/></a>
 </Button>
 </div>
 {num.notes && (
 <p className="text-xs text-muted-foreground mt-2">{num.notes}</p>
 )}
 </CardContent>
 </Card>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 )}

 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent aria-describedby="useful-number-dialog-desc">
 <DialogHeader>
 <DialogTitle>Nuovo Numero Utile</DialogTitle>
 <p id="useful-number-dialog-desc"className="text-sm text-muted-foreground">
 Aggiungi un numero di telefono utile per la tua farmacia.
 </p>
 </DialogHeader>
 <form onSubmit={handleSubmit}>
 <div className="space-y-4 py-4">
 <div>
 <Label>Nome / Descrizione *</Label>
 <Input
 value={formData.name}
 onChange={(e) => setFormData({...formData, name: e.target.value})}
 required
 placeholder="Es. Pronto Soccorso S. Maria"
 data-testid="input-name"
 />
 </div>
 <div>
 <Label>Numero *</Label>
 <Input
 value={formData.phone}
 onChange={(e) => setFormData({...formData, phone: e.target.value})}
 required
 placeholder="Es. 06 1234567"
 data-testid="input-phone"
 />
 </div>
 <div>
 <Label>Categoria</Label>
 <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
 <SelectTrigger data-testid="select-category">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {CATEGORIES.map(cat => (
 <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label>Note</Label>
 <Textarea
 value={formData.notes}
 onChange={(e) => setFormData({...formData, notes: e.target.value})}
 placeholder="Orari, indicazioni..."
 data-testid="input-notes"
 />
 </div>
 </div>
 <DialogFooter>
 <Button type="button"variant="outline"onClick={() => setDialogOpen(false)}>Annulla</Button>
 <Button type="submit"data-testid="submit-number">Salva</Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 </Layout>
 );
}

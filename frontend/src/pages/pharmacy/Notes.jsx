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
 Search, Plus, Pencil, Trash2, StickyNote, Pin, PinOff
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';


const NOTE_COLORS = [
 { value: 'default', label: 'Neutro', bg: 'bg-card', border: 'border-border' },
 { value: 'yellow', label: 'Giallo', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800' },
 { value: 'green', label: 'Verde', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' },
 { value: 'blue', label: 'Blu', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
 { value: 'red', label: 'Rosso', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-800' }
];

export default function NotesPage() {
 const [notes, setNotes] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editing, setEditing] = useState(null);
 const [formData, setFormData] = useState({ title: '', content: '', color: 'default', pinned: false });

 useEffect(() => { fetchNotes(); }, []);

 const fetchNotes = async () => {
 try {
 const response = await axios.get(`${API}/notes`, { withCredentials: true });
 setNotes(ensureArray(response.data));
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
 await axios.put(`${API}/notes/${editing.note_id}`, formData, { withCredentials: true });
 toast.success('Nota aggiornata');
 } else {
 await axios.post(`${API}/notes`, formData, { withCredentials: true });
 toast.success('Nota creata');
 }
 setDialogOpen(false);
 resetForm();
 fetchNotes();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleDelete = async (id) => {
 if (!window.confirm('Eliminare questa nota?')) return;
 try {
 await axios.delete(`${API}/notes/${id}`, { withCredentials: true });
 toast.success('Nota eliminata');
 fetchNotes();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleTogglePin = async (note) => {
 try {
 await axios.put(`${API}/notes/${note.note_id}`, { pinned: !note.pinned }, { withCredentials: true });
 toast.success(note.pinned ? 'Nota sbloccata' : 'Nota fissata');
 fetchNotes();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleEdit = (note) => {
 setEditing(note);
 setFormData({ title: note.title, content: note.content, color: note.color || 'default', pinned: note.pinned || false });
 setDialogOpen(true);
 };

 const resetForm = () => {
 setEditing(null);
 setFormData({ title: '', content: '', color: 'default', pinned: false });
 };

 const getColorClass = (color) => {
 const found = NOTE_COLORS.find(c => c.value === color);
 return found || NOTE_COLORS[0];
 };

 const safeNotes = ensureArray(notes);

 const filtered = safeNotes.filter(n =>
 (n.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 (n.content || '').toLowerCase().includes(searchTerm.toLowerCase())
 );

 const pinnedNotes = filtered.filter(n => n.pinned);
 const unpinnedNotes = filtered.filter(n => !n.pinned);

 if (loading) {
 return <Layout title="Block Notes"><div className="flex items-center justify-center h-64"><div className="spinner"></div></div></Layout>;
 }

 const renderNote = (note, index) => {
 const colorClass = getColorClass(note.color);
 return (
 <Card
 key={note.note_id}
 className={`card-interactive animate-slide-up stagger-${index % 5} ${colorClass.bg} ${colorClass.border} border`}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between mb-2">
 <div className="flex-1">
 <div className="flex items-center gap-2">
 {note.pinned && <Pin className="w-4 h-4 text-primary"/>}
 <h3 className="font-semibold line-clamp-1">{note.title}</h3>
 </div>
 </div>
 <div className="flex gap-1">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleTogglePin(note)}
 className="h-8 w-8"
 data-testid={`pin-${note.note_id}`}
 >
 {note.pinned ? <PinOff className="w-4 h-4"/> : <Pin className="w-4 h-4"/>}
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleEdit(note)}
 className="h-8 w-8"
 data-testid={`edit-${note.note_id}`}
 >
 <Pencil className="w-4 h-4"/>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleDelete(note.note_id)}
 className="h-8 w-8 text-destructive"
 data-testid={`delete-${note.note_id}`}
 >
 <Trash2 className="w-4 h-4"/>
 </Button>
 </div>
 </div>
 <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">{note.content}</p>
 <p className="text-xs text-muted-foreground/60 mt-3">
 {new Date(note.updated_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
 </p>
 </CardContent>
 </Card>
 );
 };

 return (
 <Layout title="Block Notes">
 <div className="space-y-6"data-testid="notes-page">
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold">Block Notes</h1>
 <p className="text-muted-foreground">{safeNotes.length} note</p>
 </div>
 <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="btn-primary"data-testid="add-note-btn">
 <Plus className="w-4 h-4 mr-2"/> Nuova Nota
 </Button>
 </div>

 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 placeholder="Cerca nelle note..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-10"
 data-testid="search-notes"
 />
 </div>

 {filtered.length === 0 ? (
 <Card><CardContent className="py-12 text-center">
 <StickyNote className="w-12 h-12 mx-auto mb-4 opacity-50"/>
 <p className="text-muted-foreground">{searchTerm ? 'Nessun risultato' : 'Nessuna nota'}</p>
 <Button onClick={() => setDialogOpen(true)} variant="outline"className="mt-4">
 <Plus className="w-4 h-4 mr-2"/> Crea la prima nota
 </Button>
 </CardContent></Card>
 ) : (
 <div className="space-y-6">
 {pinnedNotes.length > 0 && (
 <div>
 <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
 <Pin className="w-4 h-4"/> Fissate ({pinnedNotes.length})
 </h3>
 <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
 {pinnedNotes.map((note, i) => renderNote(note, i))}
 </div>
 </div>
 )}
 {unpinnedNotes.length > 0 && (
 <div>
 {pinnedNotes.length > 0 && (
 <h3 className="text-sm font-semibold text-muted-foreground mb-3">
 Altre note ({unpinnedNotes.length})
 </h3>
 )}
 <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
 {unpinnedNotes.map((note, i) => renderNote(note, i))}
 </div>
 </div>
 )}
 </div>
 )}

 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent aria-describedby="note-dialog-desc">
 <DialogHeader>
 <DialogTitle>{editing ? 'Modifica Nota' : 'Nuova Nota'}</DialogTitle>
 <p id="note-dialog-desc"className="text-sm text-muted-foreground">
 {editing ? 'Modifica i dettagli della nota.' : 'Crea una nuova nota per il tuo block notes.'}
 </p>
 </DialogHeader>
 <form onSubmit={handleSubmit}>
 <div className="space-y-4 py-4">
 <div>
 <Label>Titolo *</Label>
 <Input
 value={formData.title}
 onChange={(e) => setFormData({...formData, title: e.target.value})}
 required
 placeholder="Titolo della nota"
 data-testid="input-title"
 />
 </div>
 <div>
 <Label>Contenuto *</Label>
 <Textarea
 value={formData.content}
 onChange={(e) => setFormData({...formData, content: e.target.value})}
 required
 placeholder="Scrivi qui..."
 className="min-h-32"
 data-testid="input-content"
 />
 </div>
 <div>
 <Label>Colore</Label>
 <div className="flex gap-2 mt-2">
 {NOTE_COLORS.map(color => (
 <button
 key={color.value}
 type="button"
 onClick={() => setFormData({...formData, color: color.value})}
 className={`w-8 h-8 rounded-lg border-2 ${color.bg} ${
 formData.color === color.value ? 'ring-2 ring-primary ring-offset-2' : color.border
 }`}
 title={color.label}
 data-testid={`color-${color.value}`}
 />
 ))}
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button type="button"variant="outline"onClick={() => setDialogOpen(false)}>Annulla</Button>
 <Button type="submit"data-testid="submit-note">{editing ? 'Salva' : 'Crea'}</Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </div>
 </Layout>
 );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Send, Package, MessageSquare, LogOut, Building2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';


const sortMessages = (items = []) => [...items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
const dedupeMessages = (items = []) => {
  const seen = new Set();
  return sortMessages(items.filter((item) => {
    if (!item?.message_id || seen.has(item.message_id)) return false;
    seen.add(item.message_id);
    return true;
  }));
};

const sameDay = (first, second) => new Date(first).toDateString() === new Date(second).toDateString();
const formatTime = (dateString) => new Date(dateString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const formatDateLabel = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Oggi';
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
};

export default function DriverChat() {
  const { driver, logout } = useDriverAuth();
  const { messages: wsMessages, removeMessages, connected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const processedMessageIdsRef = useRef(new Set());

  const markMessagesRead = useCallback(async () => {
    try {
      await axios.put(`${API}/driver/messages/read`, {}, { withCredentials: true });
    } catch {}
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/driver/messages`, { withCredentials: true });
      const normalizedMessages = dedupeMessages(ensureArray(response.data));
      normalizedMessages.forEach((message) => {
        if (message?.message_id) processedMessageIdsRef.current.add(message.message_id);
      });
      setMessages(normalizedMessages);
      markMessagesRead();
    } catch {
      toast.error('Errore nel caricamento messaggi');
    } finally {
      setLoading(false);
    }
  }, [markMessagesRead]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!connected) return;
    fetchMessages();
  }, [connected, fetchMessages]);

  useEffect(() => {
    const incoming = ensureArray(wsMessages).filter((message) => message.sender_type === 'pharmacy' && (!message.message_id || !processedMessageIdsRef.current.has(message.message_id)));
    if (!incoming.length) return;

    incoming.forEach((message) => {
      if (message?.message_id) processedMessageIdsRef.current.add(message.message_id);
    });
    setMessages((prev) => dedupeMessages([...ensureArray(prev), ...incoming]));
    removeMessages(incoming.map((message) => message.message_id).filter(Boolean));
    markMessagesRead();
  }, [markMessagesRead, removeMessages, wsMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const response = await axios.post(`${API}/driver/messages`, {
        content: newMessage.trim(),
      }, { withCredentials: true });

      if (response.data?.message_id) processedMessageIdsRef.current.add(response.data.message_id);
      setMessages((prev) => dedupeMessages([...ensureArray(prev), response.data]));
      setNewMessage('');
    } catch {
      toast.error('Errore invio messaggio');
    } finally {
      setSending(false);
    }
  };

  const safeMessages = ensureArray(messages);

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#09090B]">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner"></div>
          <p className="text-sm text-zinc-400">Caricamento chat…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-[#09090B] pb-16" data-testid="driver-chat">
      <header className="sticky top-0 z-40 glass border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-500/20 text-blue-400">
                <Building2 className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-white">Farmacia</p>
              <p className="text-xs text-zinc-500">Scrivi per indirizzo, pagamento o note cliente</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-2 border-zinc-700 bg-zinc-900/70 text-zinc-300">
            {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
            {connected ? 'Online' : 'Riconnessione'}
          </Badge>
        </div>
      </header>

      <div className="px-4 py-4">
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Chat operativa</p>
                <p className="text-xs text-zinc-500">{driver?.name || 'Fattorino'} · {driver?.vehicle_type || 'Consegne'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Messaggi</p>
                <p className="text-lg font-semibold text-white">{safeMessages.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ScrollArea className="h-[calc(100vh-15rem)] px-4 pb-4">
        <div className="space-y-4">
          {safeMessages.length === 0 ? (
            <div className="py-16 text-center">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 text-zinc-700" />
              <p className="font-medium text-zinc-300">Nessun messaggio</p>
              <p className="mt-1 text-sm text-zinc-500">Quando hai bisogno di chiarimenti, scrivi qui alla farmacia.</p>
            </div>
          ) : (
            safeMessages.map((message, index) => {
              const showDateDivider = index === 0 || !sameDay(safeMessages[index - 1].created_at, message.created_at);
              return (
                <React.Fragment key={message.message_id}>
                  {showDateDivider && (
                    <div className="flex justify-center">
                      <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-500">
                        {formatDateLabel(message.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${message.sender_type === 'driver' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`chat-bubble ${message.sender_type === 'driver' ? 'sent' : 'received'}`}>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      <p className={`mt-1 text-xs ${message.sender_type === 'driver' ? 'text-black/60' : 'text-zinc-500'}`}>
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="sticky bottom-16 border-t border-white/5 bg-[#09090B]/95 px-4 py-3 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
          <span>Messaggi brevi e chiari aiutano la farmacia a risponderti più in fretta.</span>
          <span>{connected ? 'Tempo reale attivo' : 'Connessione in ripristino'}</span>
        </div>
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder="Scrivi un messaggio…"
            className="flex-1 border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
            data-testid="driver-chat-input"
          />
          <Button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="bg-teal-500 text-black hover:bg-teal-600"
            data-testid="driver-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <nav className="mobile-nav">
        <div className="flex justify-around">
          <Link to="/driver" className="mobile-nav-item">
            <Package className="h-5 w-5" />
            <span>Consegne</span>
          </Link>
          <Link to="/driver/chat" className="mobile-nav-item active">
            <MessageSquare className="h-5 w-5" />
            <span>Chat</span>
          </Link>
          <button onClick={logout} className="mobile-nav-item">
            <LogOut className="h-5 w-5" />
            <span>Esci</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { useSocket } from '../../contexts/SocketContext';
import {
  MessageSquare, Send, Truck, ArrowLeft, Search, Phone, Wifi,
  WifiOff, CircleDot
} from 'lucide-react';
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
const dayLabel = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Oggi';
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatConversationTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
};

const buildUpdatedConversation = (conversation, message, isCurrentConversation) => ({
  ...conversation,
  last_message: message.content,
  last_message_at: message.created_at,
  last_sender_type: message.sender_type,
  unread_count: message.sender_type === 'driver' && !isCurrentConversation
    ? (conversation.unread_count || 0) + 1
    : 0,
});

export default function ChatPage() {
  const { driverId } = useParams();
  const navigate = useNavigate();
  const { messages: wsMessages, removeMessages, connected } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const processedMessageIdsRef = useRef(new Set());

  const selectedConversation = useMemo(
    () => ensureArray(conversations).find((conversation) => conversation.driver_id === driverId) || null,
    [conversations, driverId]
  );

  const filteredConversations = useMemo(() => {
    const safeConversations = ensureArray(conversations);
    const term = searchTerm.trim().toLowerCase();
    if (!term) return safeConversations;
    return safeConversations.filter((conversation) => [
      conversation.driver_name,
      conversation.vehicle_type,
      conversation.driver_phone,
      conversation.last_message,
    ].filter(Boolean).some((value) => value.toLowerCase().includes(term)));
  }, [conversations, searchTerm]);

  const updateConversationList = useCallback((updater) => {
    setConversations((prev) => {
      const safePrev = ensureArray(prev);
      const next = typeof updater === 'function' ? updater(safePrev) : updater;
      return [...ensureArray(next)]
        .sort((a, b) => (a.driver_name || '').localeCompare(b.driver_name || '', 'it'))
        .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
    });
  }, []);

  const markConversationRead = useCallback(async (selectedDriverId) => {
    if (!selectedDriverId) return;
    try {
      await axios.put(`${API}/messages/${selectedDriverId}/read`, {}, { withCredentials: true });
    } catch {}
    updateConversationList((prev) => prev.map((conversation) => (
      conversation.driver_id === selectedDriverId
        ? { ...conversation, unread_count: 0 }
        : conversation
    )));
  }, [updateConversationList]);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/messages/conversations`, { withCredentials: true });
      updateConversationList(ensureArray(response.data));
    } catch {
      toast.error('Errore nel caricamento conversazioni');
    } finally {
      setLoadingList(false);
    }
  }, [updateConversationList]);

  const fetchMessages = useCallback(async (selectedDriverId, silent = false) => {
    if (!selectedDriverId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const response = await axios.get(`${API}/messages/${selectedDriverId}`, { withCredentials: true });
      const normalizedMessages = dedupeMessages(ensureArray(response.data));
      normalizedMessages.forEach((message) => {
        if (message?.message_id) processedMessageIdsRef.current.add(message.message_id);
      });
      setMessages(normalizedMessages);
      markConversationRead(selectedDriverId);
    } catch {
      toast.error('Errore nel caricamento messaggi');
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [markConversationRead]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!driverId) {
      setMessages([]);
      return;
    }
    fetchMessages(driverId);
  }, [driverId, fetchMessages]);

  useEffect(() => {
    if (!connected || !driverId) return;
    fetchMessages(driverId, true);
  }, [connected, driverId, fetchMessages]);

  useEffect(() => {
    const incoming = ensureArray(wsMessages).filter((message) => message.sender_type === 'driver' && (!message.message_id || !processedMessageIdsRef.current.has(message.message_id)));
    if (!incoming.length) return;

    updateConversationList((prev) => {
      const map = new Map(prev.map((conversation) => [conversation.driver_id, conversation]));
      incoming.forEach((message) => {
        const currentConversation = map.get(message.driver_id) || {
          driver_id: message.driver_id,
          driver_name: 'Fattorino',
          driver_phone: '',
          vehicle_type: '',
          is_active: true,
          unread_count: 0,
        };
        map.set(message.driver_id, buildUpdatedConversation(currentConversation, message, message.driver_id === driverId));
      });
      return Array.from(map.values());
    });

    const currentConversationMessages = incoming.filter((message) => message.driver_id === driverId);
    if (currentConversationMessages.length) {
      currentConversationMessages.forEach((message) => {
        if (message?.message_id) processedMessageIdsRef.current.add(message.message_id);
      });
      setMessages((prev) => dedupeMessages([...ensureArray(prev), ...currentConversationMessages]));
      markConversationRead(driverId);
    }

    removeMessages(incoming.map((message) => message.message_id).filter(Boolean));
  }, [driverId, markConversationRead, removeMessages, updateConversationList, wsMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = (conversation) => {
    navigate(`/chat/${conversation.driver_id}`);
  };

  const handleBackToList = () => {
    setMessages([]);
    navigate('/chat');
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!newMessage.trim() || !driverId || sending) return;

    setSending(true);
    try {
      const response = await axios.post(
        `${API}/messages`,
        { driver_id: driverId, content: newMessage.trim() },
        { withCredentials: true }
      );

      const createdMessage = response.data;
      if (createdMessage?.message_id) processedMessageIdsRef.current.add(createdMessage.message_id);
      setMessages((prev) => dedupeMessages([...ensureArray(prev), createdMessage]));
      updateConversationList((prev) => {
        const safePrev = ensureArray(prev);
        const existingConversation = safePrev.find((conversation) => conversation.driver_id === driverId);
        const baseConversation = existingConversation || selectedConversation || {
          driver_id: driverId,
          driver_name: 'Fattorino',
          driver_phone: '',
          vehicle_type: '',
          is_active: true,
          unread_count: 0,
        };

        const nextConversation = {
          ...baseConversation,
          last_message: createdMessage.content,
          last_message_at: createdMessage.created_at,
          last_sender_type: 'pharmacy',
          unread_count: 0,
        };

        if (existingConversation) {
          return safePrev.map((conversation) => (
            conversation.driver_id === driverId ? nextConversation : conversation
          ));
        }

        return [nextConversation, ...safePrev];
      });
      setNewMessage('');
    } catch {
      toast.error('Errore invio messaggio');
    } finally {
      setSending(false);
    }
  };

  const safeMessages = ensureArray(messages);

  if (loadingList) {
    return (
      <Layout title="Chat">
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <div className="spinner"></div>
          <p className="text-sm text-muted-foreground">Caricamento conversazioni…</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Chat">
      <div className="space-y-4" data-testid="chat-page">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chat fattorini</h1>
            <p className="text-sm text-muted-foreground">Messaggi rapidi per indirizzi, note cliente, pagamenti e aggiornamenti operativi.</p>
          </div>
          <Badge variant={connected ? 'secondary' : 'outline'} className="w-fit gap-2 px-3 py-1">
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? 'Tempo reale attivo' : 'Riconnessione in corso'}
          </Badge>
        </div>

        <div className="grid h-[calc(100vh-11.5rem)] gap-4 md:grid-cols-[320px,1fr]">
          <Card className={`${driverId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col`}>
            <CardHeader className="gap-3 border-b pb-4">
              <div>
                <CardTitle className="text-lg">Conversazioni</CardTitle>
                <p className="text-sm text-muted-foreground">{filteredConversations.length} fattorini disponibili</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cerca fattorino…"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {filteredConversations.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nessun fattorino trovato.
                  </div>
                ) : filteredConversations.map((conversation) => (
                  <button
                    key={conversation.driver_id}
                    onClick={() => handleSelectConversation(conversation)}
                    className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                      driverId === conversation.driver_id
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:border-border hover:bg-secondary/60'
                    }`}
                    data-testid={`chat-driver-${conversation.driver_id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {conversation.driver_name?.charAt(0) || 'F'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium text-foreground">{conversation.driver_name}</p>
                          <span className="text-[11px] text-muted-foreground">{formatConversationTime(conversation.last_message_at)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <CircleDot className={`h-3 w-3 ${conversation.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                          <span className="truncate">{conversation.vehicle_type || 'Fattorino'}</span>
                        </div>
                        <div className="mt-2 flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {conversation.last_message
                              ? `${conversation.last_sender_type === 'pharmacy' ? 'Tu: ' : ''}${conversation.last_message}`
                              : 'Nessun messaggio ancora inviato'}
                          </p>
                          {conversation.unread_count > 0 && (
                            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                              {conversation.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {!driverId && (
            <Card className="md:hidden border-dashed border-primary/30 bg-primary/5">
              <CardContent className="p-5 text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-primary/70" />
                <p className="font-medium text-foreground">Seleziona un fattorino dalla lista</p>
                <p className="mt-1 text-sm text-muted-foreground">Su mobile la conversazione si apre a schermo intero dopo il tap sul nome del fattorino.</p>
              </CardContent>
            </Card>
          )}

          <Card className={`${!driverId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col`}>
            {!selectedConversation ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center">
                <div>
                  <MessageSquare className="mx-auto mb-4 h-14 w-14 text-muted-foreground/40" />
                  <p className="text-lg font-medium text-foreground">Seleziona un fattorino</p>
                  <p className="mt-1 text-sm text-muted-foreground">Apri una conversazione per chiarire subito indirizzo, resto da dare o priorità della consegna.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={handleBackToList}>
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {selectedConversation.driver_name?.charAt(0) || 'F'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-foreground">{selectedConversation.driver_name}</h3>
                        <Badge variant="outline" className="gap-1.5 text-[11px]">
                          <Truck className="h-3 w-3" />
                          {selectedConversation.vehicle_type || 'Fattorino'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedConversation.driver_phone || 'Telefono non disponibile'}
                      </p>
                    </div>
                    {selectedConversation.driver_phone && (
                      <Button asChild variant="outline" size="icon">
                        <a href={`tel:${selectedConversation.driver_phone}`}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 px-4 py-4">
                  {loadingMessages ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                      <div className="spinner"></div>
                      <p className="text-sm text-muted-foreground">Apro la conversazione…</p>
                    </div>
                  ) : safeMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/40" />
                      <p className="font-medium text-foreground">Nessun messaggio per ora</p>
                      <p className="mt-1 text-sm text-muted-foreground">Scrivi tu per primo per dare indicazioni operative al fattorino.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {safeMessages.map((message, index) => {
                        const showDayDivider = index === 0 || !sameDay(safeMessages[index - 1].created_at, message.created_at);
                        return (
                          <React.Fragment key={message.message_id}>
                            {showDayDivider && (
                              <div className="flex justify-center">
                                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                                  {dayLabel(message.created_at)}
                                </span>
                              </div>
                            )}
                            <div className={`flex ${message.sender_type === 'pharmacy' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`chat-bubble ${message.sender_type === 'pharmacy' ? 'sent' : 'received'}`}>
                                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                <p className={`mt-1 text-xs ${message.sender_type === 'pharmacy' ? 'text-black/60' : 'text-muted-foreground'}`}>
                                  {new Date(message.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                <form onSubmit={handleSendMessage} className="border-t p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Invia istruzioni brevi e chiare.</span>
                    <span>{connected ? 'Sincronizzato' : 'Invio disponibile, realtime in ripristino'}</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      placeholder="Scrivi un messaggio operativo…"
                      className="flex-1"
                      data-testid="chat-input"
                    />
                    <Button type="submit" disabled={!newMessage.trim() || sending} className="btn-primary" data-testid="send-message-btn">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}

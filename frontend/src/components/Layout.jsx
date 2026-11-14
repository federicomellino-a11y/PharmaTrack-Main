import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useTheme } from '../contexts/ThemeContext';
import { InstallAppButton } from './InstallAppButton';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from './ui/dropdown-menu';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import CommandPalette from './CommandPalette';
import { ensureArray } from '@/lib/collections';
import { navVisibili, raggruppaMenu } from '@/lib/vociMenu';
import { useConversationsQuery } from '@/hooks/queries';
import NavMenu from './menu/NavMenu';
import {
  Settings, Bell, LogOut, Menu, X, ChevronRight,
  Sun, Moon, Plus, Home, Check, Trash2, RefreshCw, Search,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

// Il menu compresso e i gruppi chiusi sono scelte della persona, non della
// sessione: restano nel browser finche' non le cambia.
const CHIAVE_COMPRESSO = 'pt-menu-compresso';
const CHIAVE_GRUPPI = 'pt-menu-gruppi';

const leggiPreferenza = (chiave, ripiego) => {
  try {
    const salvato = window.localStorage.getItem(chiave);
    return salvato === null ? ripiego : JSON.parse(salvato);
  } catch {
    return ripiego;
  }
};

const salvaPreferenza = (chiave, valore) => {
  try {
    window.localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    /* browser senza memoria locale: si riparte dal default */
  }
};

// Su telefono il menu e' sempre largo: le icone da sole non si leggono.
const useSchermoLargo = () => {
  const [largo, setLargo] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const cambia = (evento) => setLargo(evento.matches);
    query.addEventListener('change', cambia);
    return () => query.removeEventListener('change', cambia);
  }, []);
  return largo;
};
const isArchivedDeliveryNotification = (notification) => (
  notification?.type === 'delivery' && ['delivered', 'cancelled'].includes(notification?.data?.status)
);

export const Layout = ({ children, title }) => {
  const { user, logout } = useAuth();
  const { notifications, markNotificationRead, markAllNotificationsRead, deleteNotification, refreshNotifications } = useSocket();
  const { toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compresso, setCompresso] = useState(() => leggiPreferenza(CHIAVE_COMPRESSO, false));
  const [gruppiAperti, setGruppiAperti] = useState(() => leggiPreferenza(CHIAVE_GRUPPI, {}));
  const schermoLargo = useSchermoLargo();
  const compatta = schermoLargo && compresso;

  const voci = navVisibili(user);
  const { gruppi, fondo } = raggruppaMenu(voci);
  const mobileNavItems = voci.filter(i => i.mobile);

  const cambiaCompresso = () => {
    setCompresso((prima) => {
      salvaPreferenza(CHIAVE_COMPRESSO, !prima);
      return !prima;
    });
  };

  const cambiaGruppo = (chiave) => {
    setGruppiAperti((prima) => {
      const dopo = { ...prima, [chiave]: prima[chiave] === false };
      salvaPreferenza(CHIAVE_GRUPPI, dopo);
      return dopo;
    });
  };

  // Se il gruppo della pagina aperta fosse chiuso, il menu sembrerebbe vuoto:
  // lo si riapre da solo quando ci si arriva.
  useEffect(() => {
    const voceAttiva = voci.find((voce) => !voce.fondo && voce.gruppo
      && (voce.path === '/dashboard' ? location.pathname === voce.path : location.pathname.startsWith(voce.path)));
    if (voceAttiva && gruppiAperti[voceAttiva.gruppo] === false) {
      setGruppiAperti((prima) => {
        const dopo = { ...prima, [voceAttiva.gruppo]: true };
        salvaPreferenza(CHIAVE_GRUPPI, dopo);
        return dopo;
      });
    }
  }, [location.pathname]);

  const safeNotifications = ensureArray(notifications);
  const unreadCount = safeNotifications.filter((notification) => !notification.is_read && !isArchivedDeliveryNotification(notification)).length;

  // Il numero accanto a "Chat" parla dei messaggi dei fattorini, non delle
  // notifiche: sono due cose diverse e prima si confondevano, perche' il badge
  // della chat mostrava il conteggio delle notifiche.
  const { data: conversazioni = [] } = useConversationsQuery();
  // il server conta gia' solo i messaggi dei fattorini non ancora letti
  const messaggiNonLetti = ensureArray(conversazioni)
    .reduce((totale, conversazione) => totale + (conversazione.unread_count || 0), 0);

  // Aprire l'elenco vuol dire averlo letto. Il badge sparisce subito, ma per
  // quella volta le righe nuove restano segnate: cosi' si vede cosa era nuovo
  // senza doverlo cercare fra le altre.
  const [nuoveAllApertura, setNuoveAllApertura] = useState(null);
  const apriNotifiche = (aperto) => {
    if (!aperto) { setNuoveAllApertura(null); return; }
    const nuove = safeNotifications.filter((n) => !n.is_read).map((n) => n.notification_id);
    setNuoveAllApertura(new Set(nuove));
    if (nuove.length) {
      // un attimo dopo, per non far sparire il pallino mentre l'occhio arriva
      setTimeout(() => markAllNotificationsRead(), 900);
    }
  };
  const eraNuova = (notifica) => Boolean(nuoveAllApertura?.has(notifica.notification_id));
  const sembraNuova = (notifica) => !notifica.is_read || eraNuova(notifica);
  const nuoveVisibili = safeNotifications
    .filter((n) => sembraNuova(n) && !isArchivedDeliveryNotification(n)).length;
  const isActive = (path) => path === '/dashboard'
    ? location.pathname === path
    : location.pathname.startsWith(path);

  // Keyboard shortcuts per velocità al banco
  useEffect(() => {
    const handler = (e) => {
      // Ignora se sta digitando in input/textarea/contenteditable
      const tag = (e.target?.tagName || '').toLowerCase();
      const role = (e.target?.getAttribute?.('role') || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
        || ['combobox', 'listbox', 'option', 'menu', 'menuitem'].includes(role);
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n') {
        e.preventDefault();
        navigate('/deliveries?new=1');
      } else if (k === 'c') {
        e.preventDefault();
        navigate('/customers');
      } else if (k === 'd') {
        e.preventDefault();
        navigate('/dashboard');
      } else if (k === 's') {
        e.preventDefault();
        navigate('/shifts');
      } else if (k === '/') {
        const search = document.querySelector('input[placeholder*="Cerca"], input[placeholder*="cerca"]');
        if (search) { e.preventDefault(); search.focus(); search.select?.(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const handleLogout = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setSidebarOpen(false);
    await logout();
  };

  return (
    <div className="min-h-screen bg-background flex gradient-mesh">
      <CommandPalette />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        ${compatta ? 'w-72 lg:w-[76px]' : 'w-72'}
        bg-sidebar border-r border-border flex flex-col
        transform transition-[transform,width] duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo e interruttore del menu */}
        <div className={`h-16 flex items-center border-b border-border shrink-0 ${compatta ? 'justify-center px-2' : 'justify-between px-5'}`}>
          {compatta ? (
            <button
              type="button"
              onClick={cambiaCompresso}
              title="Espandi menu"
              aria-label="Espandi menu"
              className="hidden lg:flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              data-testid="sidebar-espandi"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          ) : (
            <>
              <Link to="/dashboard" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2">
                <img src="/logo.webp" alt="PharmaTrack" width="400" height="153" className="h-9 w-auto" />
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={cambiaCompresso}
                  title="Comprimi menu"
                  aria-label="Comprimi menu"
                  className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  data-testid="sidebar-comprimi"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
                <button className="lg:hidden p-1 rounded-lg hover:bg-secondary"
                  onClick={() => setSidebarOpen(false)}>
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Nuova consegna */}
        <div className={`border-b border-border shrink-0 ${compatta ? 'px-2 py-3' : 'px-4 py-3'}`}>
          {compatta ? (
            <Link to="/deliveries?new=true"
              title="Nuova consegna"
              aria-label="Nuova consegna"
              className="flex h-10 w-full items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              onClick={() => setSidebarOpen(false)}>
              <Plus className="w-4 h-4" />
            </Link>
          ) : (
            <Link to="/deliveries?new=true"
              className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm"
              onClick={() => setSidebarOpen(false)}>
              <Plus className="w-4 h-4" />
              Nuova Consegna
            </Link>
          )}
        </div>

        {/* Voci di menu, per gruppi */}
        <ScrollArea className="flex-1 py-3">
          <NavMenu
            gruppi={gruppi}
            fondo={fondo}
            compatta={compatta}
            isActive={isActive}
            onNavigate={() => setSidebarOpen(false)}
            badge={messaggiNonLetti}
            gruppiAperti={gruppiAperti}
            onToggleGruppo={cambiaGruppo}
          />
        </ScrollArea>

        {/* Footer: tema e persona collegata */}
        <div className={`border-t border-border shrink-0 space-y-2 ${compatta ? 'p-2' : 'p-4'}`}>
          {compatta ? (
            <>
              <button onClick={toggleTheme}
                title={isDark ? 'Tema scuro: passa al chiaro' : 'Tema chiaro: passa allo scuro'}
                aria-label="Cambia tema"
                className="flex h-10 w-full items-center justify-center rounded-xl bg-secondary/60 text-foreground transition-colors hover:bg-secondary">
                {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button type="button" onClick={handleLogout}
                title={`Esci (${user?.name || ''})`}
                aria-label="Esci"
                className="flex h-10 w-full items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors text-sm">
                <span className="text-muted-foreground font-medium">Tema</span>
                <div className="flex items-center gap-1.5 text-foreground font-medium">
                  {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  {isDark ? 'Scuro' : 'Chiaro'}
                </div>
              </button>
              <div className="flex items-center gap-3 px-2 py-1">
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.pharmacy_name || 'La mia farmacia'}</p>
                </div>
                <button type="button" onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Esci">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-5 border-b border-border bg-sidebar/85 backdrop-blur-md sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-secondary transition-colors"
              onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-btn">
              <Menu className="w-5 h-5" />
            </button>
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Home className="w-3.5 h-3.5" />
              {title && (
                <>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-foreground font-semibold">{title}</span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Command palette trigger */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
              className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl border border-border bg-secondary/50 text-muted-foreground text-sm hover:bg-secondary transition-colors mr-1"
              data-testid="command-palette-trigger"
              title="Vai a una pagina o cerca un cliente, una consegna, un fattorino"
            >
              <Search className="w-4 h-4" />
              <span>Vai a / Cerca</span>
              <kbd className="ml-1 px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono">⌘K</kbd>
            </button>
            {/* Installa l'app: su mobile e tablet, dove il prompt del browser
                non sempre ricompare dopo una disinstallazione */}
            <InstallAppButton variant="ghost" size="sm" className="rounded-xl lg:hidden" />
            {/* Notifications */}
            <DropdownMenu onOpenChange={apriNotifiche}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-xl" data-testid="notifications-btn">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">Notifiche</h3>
                    {nuoveVisibili > 0 && (
                      <Badge variant="secondary" className="text-xs">{nuoveVisibili} nuove</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      onClick={() => refreshNotifications()}
                      title="Aggiorna notifiche"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary transition-colors hover:opacity-80"
                        onClick={() => markAllNotificationsRead()}
                      >
                        Segna tutte lette
                      </button>
                    )}
                  </div>
                </div>
                <ScrollArea className="h-72">
                  {safeNotifications.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Nessuna notifica
                    </div>
                  ) : (
                    safeNotifications.slice(0, 12).map((n) => (
                      <div
                        key={n.notification_id}
                        className={`px-4 py-3 border-b border-border/50 last:border-0 ${sembraNuova(n) ? 'bg-primary/5' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            {sembraNuova(n) && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                            <div className={sembraNuova(n) ? 'min-w-0' : 'ml-4 min-w-0'}>
                              <p className="truncate text-sm font-medium leading-tight">{n.title}</p>
                              <p className="mt-0.5 break-words text-xs text-muted-foreground">{n.message}</p>
                              {isArchivedDeliveryNotification(n) && (
                                <p className="mt-1 text-[11px] text-muted-foreground">Notifica archiviata: non viene conteggiata nel badge.</p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteNotification(n.notification_id);
                            }}
                            title="Elimina notifica"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {!n.is_read && (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                              onClick={() => markNotificationRead(n.notification_id)}
                            >
                              <Check className="h-3 w-3" />Segna letta
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl" data-testid="user-menu-btn">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user?.picture} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {user?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="w-4 h-4 mr-2" />Impostazioni
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}
                  className="text-destructive focus:text-destructive cursor-pointer" data-testid="logout-btn">
                  <LogOut className="w-4 h-4 mr-2" />Esci
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-5 overflow-auto main-content-with-nav page-enter">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav className="pharmacy-bottom-nav">
          {mobileNavItems.slice(0, 2).map((item) => {
            const active = isActive(item.path);
            return (
              <Link key={item.path} to={item.path}
                className={active ? 'active' : ''}
                onClick={() => setSidebarOpen(false)}>
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.badge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                      {messaggiNonLetti > 9 ? '9' : messaggiNonLetti}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link to="/quick" className={`dock-add ${isActive('/quick') ? 'active' : ''}`} aria-label="Nuova consegna">
            <span className="dock-add-btn"><Plus className="w-6 h-6" /></span>
            <span>Nuova</span>
          </Link>
          {mobileNavItems.slice(2).map((item) => {
            const active = isActive(item.path);
            return (
              <Link key={item.path} to={item.path}
                className={active ? 'active' : ''}
                onClick={() => setSidebarOpen(false)}>
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.badge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                      {messaggiNonLetti > 9 ? '9' : messaggiNonLetti}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

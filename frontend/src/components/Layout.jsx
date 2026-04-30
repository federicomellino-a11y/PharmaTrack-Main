import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from './ui/dropdown-menu';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { ensureArray } from '@/lib/collections';
import {
  LayoutDashboard, Users, Package, Truck, MessageSquare, Archive, Settings,
  Bell, LogOut, Menu, X, ChevronRight, BarChart3, Stethoscope,
  Phone, StickyNote, Sun, Moon, Plus, Home, Check, Trash2, RefreshCw, Map, Wallet, Plug
} from 'lucide-react';

const navItems = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Home',          mobile: true },
  { path: '/deliveries',    icon: Package,         label: 'Consegne',      mobile: true },
  { path: '/customers',     icon: Users,           label: 'Clienti',       mobile: true },
  { path: '/drivers',       icon: Truck,           label: 'Fattorini',     mobile: true },
  { path: '/chat',          icon: MessageSquare,   label: 'Chat',          mobile: true, badge: true },
  { divider: true },
  { path: '/shifts',        icon: Wallet,          label: 'Turni & Cassa' },
  { path: '/tracking',      icon: Map,             label: 'Tracking Live' },
  { path: '/reports',       icon: BarChart3,       label: 'Report' },
  { path: '/doctors',       icon: Stethoscope,     label: 'Medici' },
  { path: '/useful-numbers',icon: Phone,           label: 'Numeri Utili' },
  { path: '/notes',         icon: StickyNote,      label: 'Block Notes' },
  { divider: true },
  { path: '/integrations',  icon: Plug,            label: 'Integrazioni' },
  { path: '/archive',       icon: Archive,         label: 'Archivio' },
  { path: '/settings',      icon: Settings,        label: 'Impostazioni' },
];

const mobileNavItems = navItems.filter(i => i.mobile);
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

  const safeNotifications = ensureArray(notifications);
  const unreadCount = safeNotifications.filter((notification) => !notification.is_read && !isArchivedDeliveryNotification(notification)).length;
  const isActive = (path) => path === '/dashboard'
    ? location.pathname === path
    : location.pathname.startsWith(path);

  // Keyboard shortcuts per velocità al banco
  useEffect(() => {
    const handler = (e) => {
      // Ignora se sta digitando in input/textarea/contenteditable
      const tag = (e.target?.tagName || '').toLowerCase();
      const editing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
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
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72
        bg-card border-r border-border flex flex-col
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-border shrink-0">
          <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
            <img src="/logo.png" alt="PharmaTrack" className="h-9 w-auto" />
          </Link>
          <button className="lg:hidden p-1 rounded-lg hover:bg-secondary"
            onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* New delivery CTA */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <Link to="/deliveries?new=true"
            className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm"
            onClick={() => setSidebarOpen(false)}>
            <Plus className="w-4 h-4" />
            Nuova Consegna
          </Link>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 py-2">
          <nav className="px-3 space-y-0.5">
            {navItems.map((item, i) => {
              if (item.divider) return <div key={i} className="my-2 h-px bg-border/60 mx-2" />;
              const active = isActive(item.path);
              return (
                <Link key={item.path} to={item.path}
                  className={`sidebar-link ${active ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}>
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && unreadCount > 0 && (
                    <Badge className="ml-auto h-5 px-1.5 text-xs bg-destructive text-destructive-foreground">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2 shrink-0">
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
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-5 border-b border-border bg-card/85 backdrop-blur-md sticky top-0 z-30 shrink-0">
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
            {/* Notifications */}
            <DropdownMenu>
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
                    {unreadCount > 0 && (
                      <Badge variant="secondary" className="text-xs">{unreadCount} nuove</Badge>
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
                        className={`px-4 py-3 border-b border-border/50 last:border-0 ${!n.is_read ? 'bg-primary/5' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            {!n.is_read && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                            <div className={!n.is_read ? 'min-w-0' : 'ml-4 min-w-0'}>
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
          {mobileNavItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link key={item.path} to={item.path}
                className={active ? 'active' : ''}
                onClick={() => setSidebarOpen(false)}>
                <div className="relative">
                  <item.icon className="w-5 h-5" />
                  {item.badge && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? '9' : unreadCount}
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

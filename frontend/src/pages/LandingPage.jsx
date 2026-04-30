import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  MapPin, MessageSquare, BarChart3, Users, Package, Shield,
  Zap, ArrowRight, CheckCircle2, Truck, Clock, Download,
  ChevronRight, Globe, Lock, HeartPulse, Route, Star,
  TrendingUp, Bell, Smartphone,
} from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

const PHOTOS = [
  'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=900&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=900&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=900&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=900&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1553484771-371a605b060b?w=900&auto=format&fit=crop&q=80',
];

const FEATURES = [
  { icon: <Package className="w-5 h-5" />, title: 'Consegne tracciate dal banco al portone', description: 'Crea l\'ordine, assegna il fattorino, stampa la bolla. Lui riceve tutto sul telefono e tu sai dove si trova in ogni momento.', color: 'from-teal-500/20 to-teal-500/5', accent: 'text-teal-600', border: 'hover:border-teal-500/40' },
  { icon: <MapPin className="w-5 h-5" />, title: 'Indirizzi geolocalizzati', description: 'Ogni cliente ha la sua posizione esatta su Google Maps. Il fattorino apre la navigazione con un tap e parte.', color: 'from-blue-500/20 to-blue-500/5', accent: 'text-blue-600', border: 'hover:border-blue-500/40' },
  { icon: <MessageSquare className="w-5 h-5" />, title: 'Comunicazione in un solo posto', description: 'Chat dedicata farmacia–fattorini. Niente più WhatsApp privati né telefonate ripetute mentre sei al banco.', color: 'from-violet-500/20 to-violet-500/5', accent: 'text-violet-600', border: 'hover:border-violet-500/40' },
  { icon: <BarChart3 className="w-5 h-5" />, title: 'Report di cassa e turni', description: 'Incassi del giorno, contanti vs POS, performance per fattorino e clienti più assidui — tutto già pronto a fine giornata.', color: 'from-orange-500/20 to-orange-500/5', accent: 'text-orange-600', border: 'hover:border-orange-500/40' },
  { icon: <Users className="w-5 h-5" />, title: 'Anagrafica clienti su misura', description: 'Storico consegne, codice fiscale, recapiti aggiuntivi e note rapide. Il farmacista trova tutto al primo colpo.', color: 'from-rose-500/20 to-rose-500/5', accent: 'text-rose-600', border: 'hover:border-rose-500/40' },
  { icon: <Bell className="w-5 h-5" />, title: 'Doppia conferma incasso', description: 'Il fattorino segna la consegna; tu confermi l\'avvenuto incasso. Zero contestazioni, cassa sempre quadrata.', color: 'from-green-500/20 to-green-500/5', accent: 'text-green-600', border: 'hover:border-green-500/40' },
];

const STEPS = [
  { n: '01', title: 'Registra la farmacia', desc: 'Account pronto in due minuti, senza inserire dati di pagamento.' },
  { n: '02', title: 'Carica fattorini e clienti', desc: 'Crea le credenziali per ogni fattorino e l\'anagrafica clienti dal pannello.' },
  { n: '03', title: 'Inizia a consegnare', desc: 'Apri il primo ordine: il fattorino lo vede subito, tu segui tutto in tempo reale.' },
];

function useIntersection(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function RevealSection({ children, className = '', delay = 0 }) {
  const [ref, visible] = useIntersection();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(32px)',
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const { isInstallable, install } = usePWAInstall();
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhoto((p) => (p + 1) % PHOTOS.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">

      {/* ── Navbar ── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <img src="/logo.png" alt="PharmaTrack" className="h-9 w-auto" />
          <nav className="flex items-center gap-1 sm:gap-2">
            {isInstallable && (
              <Button variant="ghost" size="sm" className="hidden md:flex gap-1.5" onClick={install}>
                <Download className="w-3.5 h-3.5" />Installa
              </Button>
            )}
            <Button variant="ghost" size="sm" className="hidden sm:flex text-muted-foreground" asChild>
              <Link to="/driver/login">Area Fattorini</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">Accedi</Link>
            </Button>
            <Button size="sm" className="btn-primary" asChild>
              <Link to="/register">Registrati</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute top-20 left-1/3 w-[600px] h-[600px] bg-primary/7 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-primary font-semibold tracking-wide">Gratuito per le farmacie italiane</span>
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 leading-[1.08] tracking-tight text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Le consegne della<br />
              tua farmacia,{' '}
              <span className="text-primary italic">finalmente</span>
              <br />sotto controllo.
            </h1>

            <p className="text-lg text-muted-foreground mb-9 max-w-lg leading-relaxed">
              Il gestionale che porta dietro al banco i tuoi fattorini, i clienti e la cassa. Apri l'ordine, lo assegni, lo segui — tutto in pochi tap, senza alzare la cornetta.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-9">
              <Button size="lg" className="btn-primary h-13 px-8 text-base font-semibold shadow-lg shadow-primary/25 hover-lift" asChild>
                <Link to="/register">Inizia Gratis <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
              <Button variant="outline" size="lg" className="h-13 hover-lift gap-2" asChild>
                <Link to="/driver/login">
                  <Truck className="w-4 h-4" />Area Fattorini
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
              {['Senza carta di credito', 'Pronto in due minuti', 'Supporto incluso'].map((t) => (
                <span key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{t}
                </span>
              ))}
            </div>
          </div>

          <div className="relative animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border" style={{ height: '440px' }}>
              {PHOTOS.map((src, i) => (
                <img
                  key={src} src={src} alt="farmacia"
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
                  style={{ opacity: i === photo ? 1 : 0 }}
                />
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                {PHOTOS.map((_, i) => (
                  <button key={i} onClick={() => setPhoto(i)} className={`h-1.5 rounded-full transition-all duration-300 ${i === photo ? 'bg-white w-5' : 'bg-white/40 w-1.5'}`} />
                ))}
              </div>
            </div>

            <div className="absolute -bottom-5 -left-5 px-4 py-3 rounded-xl glass border border-border shadow-xl animate-float">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <Route className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tracking</p>
                  <p className="text-base font-black">Live 24/7</p>
                </div>
              </div>
            </div>

            <div className="absolute -top-4 -right-4 px-3 py-2 rounded-xl glass border border-border shadow-xl animate-float" style={{ animationDelay: '300ms' }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400">Sistema operativo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="py-12 border-y border-border bg-secondary/20 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { icon: <TrendingUp className="w-5 h-5" />, v: 'Free', label: 'Per le farmacie italiane' },
            { icon: <Package className="w-5 h-5" />, v: 'Live', label: 'Tracciamento delle consegne' },
            { icon: <Smartphone className="w-5 h-5" />, v: 'PWA', label: 'Web, smartphone e tablet' },
            { icon: <Shield className="w-5 h-5" />, v: 'HTTPS', label: 'Connessione cifrata' },
          ].map((s) => (
            <div key={s.label} className="group">
              <div className="flex justify-center mb-2 text-primary group-hover:scale-110 transition-transform">{s.icon}</div>
              <p className="text-3xl font-black tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{s.v}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <RevealSection className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Funzionalità</p>
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Solo le funzioni che usi davvero,<br className="hidden sm:block" /> giorno dopo giorno.
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-lg">
              Niente menù infiniti né schermate che rallentano. Ogni schermata è pensata per un farmacista che ha venti secondi tra un cliente e l'altro.
            </p>
          </RevealSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <RevealSection key={f.title} delay={i * 60}>
                <div className={`p-6 rounded-2xl bg-gradient-to-br ${f.color} border border-border ${f.border} transition-all duration-300 hover-lift h-full group`}>
                  <div className={`w-11 h-11 rounded-xl bg-background/70 backdrop-blur flex items-center justify-center mb-4 shadow-sm ${f.accent} group-hover:scale-110 transition-transform`}>
                    {f.icon}
                  </div>
                  <h3 className="text-base font-bold mb-2 text-foreground">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-28 px-4 sm:px-6 lg:px-8 bg-secondary/20">
        <div className="max-w-5xl mx-auto">
          <RevealSection className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Come funziona</p>
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Parti in 3 passi, consegna dal primo giorno.
            </h2>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-8 left-[calc(33%+2rem)] right-[calc(33%+2rem)] h-px bg-border" />
            {STEPS.map((s, i) => (
              <RevealSection key={s.n} delay={i * 100} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 relative z-10 bg-background hover:bg-primary/20 transition-colors duration-300 group">
                  <span className="text-xl font-black text-primary">{s.n}</span>
                </div>
                <h3 className="font-bold mb-2 text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portals ── */}
      <section className="py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <RevealSection className="text-center mb-14">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Due portali, un'unica logica</p>
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Ognuno vede ciò che gli serve.
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">In farmacia hai il quadro completo. Il fattorino ha l'app sul telefono con la singola consegna che gli interessa.</p>
          </RevealSection>

          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {[
              {
                icon: <HeartPulse className="w-6 h-6" />,
                title: 'Portale Farmacia',
                subtitle: 'Tutto sotto controllo, dalla scrivania o dal cellulare',
                color: 'border-teal-500/30 bg-teal-500/5',
                iconColor: 'text-teal-600',
                iconBg: 'bg-teal-500/10',
                points: ['Mappa live e consegne in corso', 'Anagrafica clienti con storico completo', 'Chat con i fattorini in tempo reale', 'Cassa, turni e archivio già impaginati'],
              },
              {
                icon: <Truck className="w-6 h-6" />,
                title: 'App Fattorino',
                subtitle: 'Pensata per chi è in scooter o in auto',
                color: 'border-blue-500/30 bg-blue-500/5',
                iconColor: 'text-blue-600',
                iconBg: 'bg-blue-500/10',
                points: ['Consegne ordinate per priorità', 'Navigazione Maps con un tap', 'Inizio e chiusura turno integrati', 'Conferma consegna e pagamento al volo'],
              },
            ].map((p, i) => (
              <RevealSection key={p.title} delay={i * 100}>
                <div className={`p-7 rounded-2xl border ${p.color} hover-lift h-full`}>
                  <div className={`w-12 h-12 rounded-xl ${p.iconBg} flex items-center justify-center mb-4 ${p.iconColor}`}>{p.icon}</div>
                  <h3 className="font-bold text-lg mb-1 text-foreground">{p.title}</h3>
                  <p className="text-sm text-muted-foreground mb-5">{p.subtitle}</p>
                  <ul className="space-y-3">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-sm text-foreground/80">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />{pt}
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-4 sm:px-6 lg:px-8 bg-secondary/20">
        <RevealSection>
          <div className="max-w-3xl mx-auto text-center">
            <div className="p-14 sm:p-20 rounded-3xl glass border border-primary/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 pointer-events-none" />
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

              <img src="/logo.png" alt="PharmaTrack" className="h-14 w-auto mx-auto mb-7 animate-float" />

              <h2
                className="text-3xl sm:text-5xl font-extrabold mb-4 text-foreground"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Pronto a portare ordine<br />nel giro consegne?
              </h2>

              <p className="text-muted-foreground mb-9 text-lg max-w-md mx-auto leading-relaxed">
                Apri il tuo account in due minuti. La tua farmacia inizia a consegnare in modo organizzato già dal primo turno.
              </p>

              <Button size="lg" className="btn-primary px-14 h-14 text-base font-semibold shadow-xl shadow-primary/25 hover-lift" asChild>
                <Link to="/register">Registrati Gratis <ArrowRight className="w-5 h-5 ml-2" /></Link>
              </Button>

              <p className="text-sm text-muted-foreground mt-6">
                Già usato da farmacie italiane · Senza dati di pagamento
              </p>
            </div>
          </div>
        </RevealSection>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <img src="/logo.png" alt="PharmaTrack" className="h-8 w-auto opacity-60" />
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/login" className="hover:text-foreground transition-colors">Accedi</Link>
            <Link to="/register" className="hover:text-foreground transition-colors">Registrati</Link>
            <Link to="/driver/login" className="hover:text-foreground transition-colors">Area Fattorini</Link>
          </div>
          <p className="text-muted-foreground text-sm">© 2026 PharmaTrack</p>
        </div>
      </footer>
    </div>
  );
}

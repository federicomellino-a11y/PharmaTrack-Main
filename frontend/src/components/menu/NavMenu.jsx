import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Badge } from '../ui/badge';

/* Il menu laterale raggruppato.
   - I gruppi si aprono e si chiudono, e la scelta resta.
   - Con il menu compresso restano le icone, con il nome nel tooltip.
   - La pagina attiva ha barra laterale, sfondo e testo in evidenza.
   Nessuna decisione qui dentro: le voci arrivano gia' filtrate dal Layout. */

const RigaVoce = ({ voce, attivo, compatta, badge, onNavigate }) => {
  const Icona = voce.icon;
  const testid = `nav-${voce.label.toLowerCase().replace(/\s/g, '-')}`;
  return (
    <Link
      to={voce.path}
      onClick={onNavigate}
      title={compatta ? voce.label : undefined}
      aria-current={attivo ? 'page' : undefined}
      data-testid={testid}
      className={`
        group relative flex items-center rounded-xl transition-colors
        ${compatta ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'}
        ${attivo
          ? 'bg-primary/12 text-primary font-semibold'
          : 'text-muted-foreground font-medium hover:bg-secondary hover:text-foreground'}
      `}
    >
      {attivo && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Icona className={`shrink-0 ${compatta ? 'h-[19px] w-[19px]' : 'h-[18px] w-[18px]'}`} />
      {!compatta && <span className="truncate text-sm">{voce.label}</span>}
      {!compatta && voce.badge && badge > 0 && (
        <Badge
          className="ml-auto h-5 px-1.5 text-xs bg-destructive text-destructive-foreground"
          title={`${badge} messaggi non letti`}
        >
          {badge > 9 ? '9+' : badge}
        </Badge>
      )}
      {compatta && voce.badge && badge > 0 && (
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
      )}
    </Link>
  );
};

export default function NavMenu({
  gruppi = [],
  fondo = [],
  compatta = false,
  isActive,
  onNavigate,
  badge = 0,
  gruppiAperti = {},
  onToggleGruppo,
}) {
  return (
    <nav className={compatta ? 'flex flex-col items-stretch gap-1 px-2' : 'flex flex-col gap-3 px-3'}>
      {gruppi.map((gruppo) => {
        const aperto = compatta || gruppiAperti[gruppo.chiave] !== false;
        return (
          <div key={gruppo.chiave} className="flex flex-col gap-0.5">
            {compatta ? (
              <div className="mx-2 my-1.5 h-px bg-border/70" aria-hidden="true" />
            ) : (
              <button
                type="button"
                onClick={() => onToggleGruppo?.(gruppo.chiave)}
                aria-expanded={aperto}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 transition-colors hover:text-foreground"
                data-testid={`nav-gruppo-${gruppo.chiave}`}
              >
                <span className="truncate">{gruppo.etichetta}</span>
                <ChevronDown
                  className={`ml-auto h-3 w-3 shrink-0 transition-transform ${aperto ? '' : '-rotate-90'}`}
                />
              </button>
            )}
            {aperto && gruppo.voci.map((voce) => (
              <RigaVoce
                key={voce.path}
                voce={voce}
                attivo={isActive(voce.path)}
                compatta={compatta}
                badge={badge}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}

      {fondo.length > 0 && (
        <div className={`flex flex-col gap-0.5 ${compatta ? 'mt-1 border-t border-border/70 pt-2' : 'mt-auto border-t border-border/70 pt-2'}`}>
          {fondo.map((voce) => (
            <RigaVoce
              key={voce.path}
              voce={voce}
              attivo={isActive(voce.path)}
              compatta={compatta}
              badge={badge}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </nav>
  );
}

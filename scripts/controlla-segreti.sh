#!/usr/bin/env bash
# Cerca segreti dove non dovrebbero stare.
#
#   ./scripts/controlla-segreti.sh          file tracciati da git
#   ./scripts/controlla-segreti.sh --dist   anche il bundle appena costruito
#
# Perché esiste: GitHub secret scanning e code scanning richiedono Advanced
# Security, che su questo repo privato non c'è. Il 4 novembre una password
# dell'admin è rimasta versionata per settimane dentro memory/ senza che
# nessuno se ne accorgesse. Questo controllo costa due secondi e chiude quella
# categoria di errore: la CI lo esegue a ogni pull request.
#
# Non è un antivirus e non ha pretese di completezza: cerca le forme di segreto
# che abbiamo davvero (connection string con password, chiavi cloud, token
# GitHub, chiavi private). Se aggiungi un servizio nuovo, aggiungi il suo
# formato qui.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

CON_DIST=0
[ "${1:-}" = "--dist" ] && CON_DIST=1

# Formati: descrizione|espressione
FORME=(
  "connection string Mongo con password|mongodb(\+srv)?://[^\"'[:space:]]+:[^\"'@[:space:]]+@"
  "chiave privata PEM|-----BEGIN [A-Z ]*PRIVATE KEY-----"
  "token GitHub classico|gh[pousr]_[A-Za-z0-9]{30,}"
  "token GitHub fine-grained|github_pat_[A-Za-z0-9_]{20,}"
  "chiave AWS|AKIA[0-9A-Z]{16}"
  "chiave OpenAI/Anthropic|sk-[A-Za-z0-9_-]{24,}"
  "token Slack|xox[baprs]-[A-Za-z0-9-]{10,}"
  "chiave API Google|AIza[0-9A-Za-z_-]{35}"
  "JWT|eyJhbGciOiJ[A-Za-z0-9_-]{10,}"
)

# Righe che contengono queste stringhe sono esempi nella documentazione,
# non segreti: il posto vuoto è dichiarato.
PLACEHOLDER='user:pwd@|mongodb\+srv://\.\.\.|your-|xxx|example\.com|CAMBIA|PLACEHOLDER'

esiti=0

# $1 = comando che stampa "file:riga:testo" per ogni riga da controllare
controlla() {
  local comando="$1" forma descrizione espressione trovate
  for forma in "${FORME[@]}"; do
    descrizione="${forma%%|*}"
    espressione="${forma#*|}"
    trovate="$(eval "$comando" | grep -InE "$espressione" 2>/dev/null | grep -vE "$PLACEHOLDER")"
    if [ -n "$trovate" ]; then
      printf '\n!! %s\n' "$descrizione"
      printf '%s\n' "$trovate" | head -10
      esiti=$((esiti + 1))
    fi
  done
}

printf 'Segreti · file tracciati\n'
# --cached: solo ciò che git consegna davvero agli altri. -I: salta i binari.
controlla 'git grep --cached -I -n -E "." -- 2>/dev/null'

printf 'Segreti · nomi di file che non devono esistere\n'
sospetti="$(git ls-files | grep -vE '\.env\.example$' | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|^credentials\.json$|(^|/)memory/' || true)"
if [ -n "$sospetti" ]; then
  printf '\n!! file versionati che non dovrebbero esserci\n%s\n' "$sospetti"
  esiti=$((esiti + 1))
fi

if [ "$CON_DIST" = "1" ]; then
  if [ ! -d frontend/dist ]; then
    printf '\nfrontend/dist non esiste: lancia prima `npm run build`.\n'
    exit 1
  fi
  printf 'Segreti · bundle di produzione\n'
  controlla 'grep -rIE "." frontend/dist/assets 2>/dev/null'
fi

if [ "$esiti" -gt 0 ]; then
  printf '\n%d controlli hanno trovato qualcosa. Un segreto nel repo va ruotato, non solo cancellato.\n' "$esiti"
  exit 1
fi

printf '\nNessun segreto riconoscibile.\n'

#!/usr/bin/env bash
# Un solo comando per sapere se il repository e' sano.
#
#   ./verifica.sh              controlli veloci: lint, tipi, test unitari, build
#   ./verifica.sh --completo   aggiunge gli E2E Playwright (serve Chromium)
#
# Esce 0 se e' tutto verde, 1 se qualcosa e' rosso. Non tocca la produzione,
# non chiama il database, non manda niente in rete: e' la stessa sequenza che
# esegue la CI prima di un merge, cosi' chi modifica lo scopre a casa propria.
set -uo pipefail

cd "$(dirname "$0")" || exit 1

COMPLETO=0
[ "${1:-}" = "--completo" ] && COMPLETO=1

ESITI=()
esegui() {
  local nome="$1"
  shift
  printf '\n== %s\n' "$nome"
  if "$@"; then
    ESITI+=("OK   $nome")
  else
    ESITI+=("KO   $nome")
  fi
}

PYTHON="$(command -v python3)"
[ -x "backend/.venv/bin/python" ] && PYTHON="$PWD/backend/.venv/bin/python"

if ! "$PYTHON" -c "import fastapi" 2>/dev/null; then
  printf 'Backend non pronto: crea il venv e installa le dipendenze.\n'
  printf '  cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt\n'
  exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
  printf 'Frontend non pronto: lancia prima `cd frontend && npm ci`.\n'
  exit 1
fi

esegui "Frontend · lint" bash -c "cd frontend && npm run lint"
esegui "Frontend · tipi (tsc)" bash -c "cd frontend && npm run typecheck"
esegui "Frontend · test unitari" bash -c "cd frontend && npm test"
esegui "Frontend · build di produzione" bash -c "cd frontend && npm run build"
esegui "Backend · test unitari" bash -c "cd backend && '$PYTHON' -m pytest tests/unit -q"

if [ "$COMPLETO" = "1" ]; then
  # Gli E2E girano sul build appena fatto: e' l'unico controllo che vede una
  # prop orfana o un componente non importato, che il build non intercetta.
  esegui "Frontend · E2E (build nuovo)" bash -c "cd frontend && npm run test:e2e"
fi

printf '\n=========== RIEPILOGO ===========\n'
ROSSI=0
for esito in "${ESITI[@]}"; do
  printf '%s\n' "$esito"
  case "$esito" in KO*) ROSSI=$((ROSSI + 1));; esac
done

if [ "$ROSSI" -gt 0 ]; then
  printf '\n%d controlli rossi: non aprire la pull request.\n' "$ROSSI"
  exit 1
fi

printf '\nTutto verde: %d controlli.\n' "${#ESITI[@]}"
[ "$COMPLETO" = "1" ] || printf 'Per includere gli E2E: ./verifica.sh --completo\n'

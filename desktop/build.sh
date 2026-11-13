#!/usr/bin/env bash
# Compila "Consegna veloce" per Windows e mette l'eseguibile dove il backend lo
# serve (backend/app/desktop/). Si compila da Linux o macOS: nessun PC Windows
# serve per il build, e nessuna dipendenza: solo la libreria standard di Go.
#
#   desktop/build.sh
set -euo pipefail
cd "$(dirname "$0")/consegna-veloce"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags "-s -w -H windowsgui" -o ../../backend/app/desktop/consegna-veloce.exe .
ls -l ../../backend/app/desktop/consegna-veloce.exe

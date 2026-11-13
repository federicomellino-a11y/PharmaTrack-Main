"""Il deploy e' verde? Allora il sito funziona? Non e' la stessa cosa.

Due volte e' successo che pipeline e deploy fossero verdi e il sito mostrasse
una pagina bianca: un chunk che non si caricava piu', un asset che Vercel non
trovava. Nessuno se ne accorgeva finche' non lo diceva un farmacista. Questo
script guarda la produzione come la guarda un browser, un minuto dopo il merge:

  1. `/api/health` risponde 200 e dice `status: ok`, con il mittente email
     validato dal provider (un mittente non validato accetta l'invio e lo scarta);
  2. l'`index.html` servito dal sito cita chunk che esistono davvero e tornano
     come `application/javascript` (o `text/css`);
  3. il login demo apre una sessione per la farmacia e per il fattorino;
  4. se il commit ha prodotto un deploy del backend, Render l'ha segnato verde
     (via GitHub Deployments: non serve nessuna chiave di Render).

Esce con codice 1 se qualcosa non torna, cosi' il workflow diventa rosso e il
merge non passa inosservato.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

SITO = os.environ.get("SITO_URL", "https://pharmatrack-zeta.vercel.app").rstrip("/")
API = os.environ.get("API_URL", "https://pharmatrack-api.onrender.com").rstrip("/")
REPO = os.environ.get("GITHUB_REPOSITORY", "federicomellino-a11y/PharmaTrack-Main")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
COMMIT = os.environ.get("COMMIT_SHA", "")

INTESTAZIONI = {"User-Agent": "pharmatrack-verifica-produzione"}
problemi: list[str] = []
fatti: list[str] = []


def chiama(url: str, metodo: str = "GET", corpo: dict | None = None,
           intestazioni: dict | None = None, tentativi: int = 3, attesa: int = 15,
           timeout: int = 30):
    """(stato, corpo, intestazioni della risposta). Ritenta: Render si sveglia."""
    dati = None
    capi = dict(INTESTAZIONI)
    capi.update(intestazioni or {})
    if corpo is not None:
        dati = json.dumps(corpo).encode()
        capi["Content-Type"] = "application/json"
    ultimo = None
    for prova in range(tentativi):
        richiesta = urllib.request.Request(url, data=dati, headers=capi, method=metodo)
        try:
            with urllib.request.urlopen(richiesta, timeout=timeout) as risposta:
                return risposta.status, risposta.read().decode("utf-8", "replace"), dict(risposta.headers)
        except urllib.error.HTTPError as errore:
            return errore.code, errore.read().decode("utf-8", "replace"), dict(errore.headers)
        except Exception as errore:  # noqa: BLE001 - rete, DNS, istanza che si accende
            ultimo = errore
            if prova < tentativi - 1:
                time.sleep(attesa)
    return None, str(ultimo), {}


def controlla_salute() -> None:
    stato, corpo, _ = chiama(f"{API}/api/health")
    if stato != 200:
        problemi.append(f"health: stato {stato} ({corpo[:150]})")
        return
    try:
        dati = json.loads(corpo)
    except json.JSONDecodeError:
        problemi.append(f"health: risposta non JSON ({corpo[:150]})")
        return
    if dati.get("status") != "ok":
        problemi.append(f"health: status {dati.get('status')!r}")
        return
    spenti = [chiave for chiave in ("admin_configured", "push_configured", "smtp_configured", "sentry_configured")
              if dati.get(chiave) is False]
    mittente_valido = dati.get("email_mittente_validato")
    if mittente_valido is True:
        fatti.append("mittente email validato dal provider")
    elif mittente_valido is False:
        # Il 13/11 e' successo esattamente questo: health verde, mittente non
        # validato, ogni email accettata e poi scartata. Il codice di accesso
        # all'admin non arrivava e niente lo diceva.
        problemi.append(
            f"health 200 ma il mittente email {dati.get('email_mittente')!r} non e' validato dal "
            "provider: gli invii vengono accettati e poi scartati, quindi nessuna email arriva"
        )
    fatti.append(f"health 200, database {dati.get('database')}, provider email {dati.get('email_provider')}")
    if spenti:
        # Non e' un guasto del sito, ma e' la cosa che si scopre tre giorni dopo.
        problemi.append(f"health 200 ma questi pezzi risultano spenti: {', '.join(spenti)}")


def controlla_chunk() -> None:
    stato, html, _ = chiama(f"{SITO}/")
    if stato != 200:
        problemi.append(f"sito: la home risponde {stato}")
        return
    riferimenti = set(re.findall(r'(?:src|href)="(/assets/[^"]+)"', html))
    if not riferimenti:
        problemi.append("sito: la home non cita nessun asset in /assets/")
        return
    if not any(r.endswith(".js") for r in riferimenti):
        problemi.append(f"sito: nessun chunk JS fra {sorted(riferimenti)[:5]}")
    for riferimento in sorted(riferimenti):
        stato_asset, corpo, capi = chiama(f"{SITO}{riferimento}", tentativi=2)
        tipo = (capi.get("Content-Type") or capi.get("content-type") or "").lower()
        if stato_asset != 200:
            problemi.append(f"asset {riferimento}: risponde {stato_asset}")
            continue
        if riferimento.endswith(".js") and "javascript" not in tipo:
            problemi.append(f"asset {riferimento}: tipo {tipo or 'assente'} invece di javascript ({len(corpo)} byte)")
        elif riferimento.endswith(".css") and "css" not in tipo:
            problemi.append(f"asset {riferimento}: tipo {tipo or 'assente'} invece di css")
    fatti.append(f"{len(riferimenti)} asset citati dalla home, tutti serviti con il tipo giusto")


def controlla_login_demo() -> None:
    for ruolo, atteso in (("pharmacy", "/auth/me"), ("driver", "/driver/me")):
        stato, corpo, capi = chiama(f"{API}/api/auth/demo", metodo="POST", corpo={"ruolo": ruolo})
        if stato != 200:
            problemi.append(f"login demo {ruolo}: stato {stato} ({corpo[:150]})")
            continue
        biscotto = capi.get("set-cookie") or capi.get("Set-Cookie") or ""
        if "session" not in biscotto.lower():
            problemi.append(f"login demo {ruolo}: nessun biscotto di sessione nella risposta")
            continue
        fatti.append(f"login demo {ruolo} 200 con sessione")


def controlla_deploy_backend() -> None:
    """Render segna il deploy come GitHub Deployment: nessuna chiave serve."""
    if not TOKEN or not COMMIT:
        fatti.append("deploy backend: salto il controllo (manca GITHUB_TOKEN o COMMIT_SHA)")
        return
    intestazioni = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"}
    stato, corpo, _ = chiama(f"https://api.github.com/repos/{REPO}/deployments?per_page=20",
                             intestazioni=intestazioni, tentativi=2)
    if stato != 200:
        problemi.append(f"deploy backend: GitHub ha risposto {stato} ({corpo[:120]})")
        return
    # Render mette lo sha in "sha" e "main" in "ref": il nome del servizio sta
    # in "environment". Cercare lo sha dentro "ref" non troverebbe mai niente.
    deploy = [d for d in json.loads(corpo)
              if "pharmatrack-api" in (d.get("environment") or "") and d.get("sha", "").startswith(COMMIT[:7])]
    if not deploy:
        fatti.append("deploy backend: nessun deploy Render per questo commit (commit senza modifiche al backend)")
        return
    ultimo = deploy[0]
    stato, corpo, _ = chiama(f"https://api.github.com/repos/{REPO}/deployments/{ultimo['id']}/statuses",
                             intestazioni=intestazioni, tentativi=2)
    if stato != 200:
        problemi.append(f"deploy backend: stati non leggibili ({stato})")
        return
    stati = json.loads(corpo)
    if not stati:
        problemi.append("deploy backend: nessuno stato registrato da Render")
        return
    ultimo_stato = stati[0]
    if ultimo_stato.get("state") != "success":
        problemi.append(f"deploy backend: Render dice {ultimo_stato.get('state')}")
        return
    fatti.append(f"deploy backend Render: success ({ultimo_stato.get('created_at')})")


def main() -> int:
    controlla_salute()
    controlla_chunk()
    controlla_login_demo()
    controlla_deploy_backend()

    print("=== controllo ===")
    for riga in fatti:
        print(f"  ok   {riga}")
    if problemi:
        print("=== da guardare ===")
        for riga in problemi:
            print(f"  KO   {riga}")
        return 1
    print("Produzione sana: sito, chunk, login demo e backend rispondono.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

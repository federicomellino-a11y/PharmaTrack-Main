"""Controllo degli automatismi: se qualcosa smette di funzionare, arriva una mail.

Il rischio vero non e' il backup che fallisce, e' il backup che smette di
partire: un rosso in fondo alla lista delle Actions non lo guarda nessuno. Qui
si controllano tre cose e si scrive solo quando c'e' qualcosa da guardare:

  1. l'API risponde e dice di stare bene;
  2. il backup notturno e' girato nelle ultime 26 ore ed e' verde;
  3. i test di integrazione notturni sono verdi e la prova di ripristino non e'
     piu' vecchia di 35 giorni.

Nessun accesso al database, nessuna scrittura: solo GET.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = "https://pharmatrack-api.onrender.com/api/health"
REPO = os.environ.get("GITHUB_REPOSITORY", "federicomellino-a11y/PharmaTrack-Main")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
BREVO = os.environ.get("BREVO_API_KEY", "")
DESTINATARIO = os.environ.get("ALERT_EMAIL") or os.environ.get("SMTP_FROM") or "federicomellino@gmail.com"
MITTENTE = os.environ.get("ALERT_FROM") or DESTINATARIO

# nome workflow -> ore massime di silenzio tollerate
ATTESI = {
    "backup-db.yml": 26,
    "test-integrazione.yml": 26,
    "dr-test.yml": 24 * 35,
}

problemi = []


def leggi(url, intestazioni=None, tentativi=3, attesa=20, timeout=30):
    ultimo = None
    for prova in range(tentativi):
        richiesta = urllib.request.Request(url, headers=intestazioni or {})
        try:
            with urllib.request.urlopen(richiesta, timeout=timeout) as risposta:
                return risposta.status, risposta.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as errore:
            return errore.code, errore.read().decode("utf-8", "replace")
        except Exception as errore:  # rete, DNS, istanza che si sveglia
            ultimo = errore
            if prova < tentativi - 1:
                time.sleep(attesa)
    return None, str(ultimo)


def controlla_api():
    stato, corpo = leggi(API, tentativi=3, attesa=25)
    if stato != 200:
        problemi.append(f"API non raggiungibile o non sana: stato {stato} ({corpo[:120]})")
        return
    try:
        dati = json.loads(corpo)
    except Exception:
        problemi.append(f"API ha risposto 200 ma non e' JSON: {corpo[:120]}")
        return
    if dati.get("status") != "ok":
        problemi.append(f"API risponde ma non e' sana: {dati.get('status')}")
    errore_email = dati.get("email_ultimo_errore")
    if errore_email:
        problemi.append(f"Ultimo invio email fallito: {errore_email.get('errore', '')[:160]}")


def ultimo_run(workflow):
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/runs?per_page=1"
    stato, corpo = leggi(url, {"Authorization": f"Bearer {TOKEN}",
                               "Accept": "application/vnd.github+json"}, tentativi=2)
    if stato != 200:
        return None, f"non ho potuto leggere i run ({stato})"
    try:
        run = json.loads(corpo)["workflow_runs"][0]
    except (KeyError, IndexError):
        return None, "nessun run registrato"
    return run, None


def controlla_workflow():
    for workflow, ore_max in ATTESI.items():
        run, errore = ultimo_run(workflow)
        if errore:
            problemi.append(f"{workflow}: {errore}")
            continue
        creato = datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
        eta_ore = (datetime.now(timezone.utc) - creato).total_seconds() / 3600
        if run.get("conclusion") not in ("success", "skipped"):
            problemi.append(
                f"{workflow}: ultimo run {run.get('conclusion') or run.get('status')} "
                f"({creato.strftime('%d/%m %H:%M')} UTC) — {run.get('html_url', '')}"
            )
        elif eta_ore > ore_max:
            problemi.append(
                f"{workflow}: nessun run riuscito da {eta_ore:.0f} ore "
                f"(atteso entro {ore_max}) — l'automatismo potrebbe essersi fermato"
            )


def manda_mail(oggetto, testo):
    if not BREVO:
        print("BREVO_API_KEY assente: allarme solo nei log", file=sys.stderr)
        return False
    corpo = json.dumps({
        "sender": {"name": "PharmaTrack", "email": MITTENTE},
        "to": [{"email": DESTINATARIO}],
        "subject": oggetto,
        "textContent": testo,
    }).encode()
    richiesta = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email", data=corpo, method="POST",
        headers={"api-key": BREVO, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(richiesta, timeout=30) as risposta:
            return risposta.status in (200, 201)
    except Exception as errore:
        print(f"invio dell'allarme fallito: {errore}", file=sys.stderr)
        return False


def main():
    controlla_api()
    controlla_workflow()

    if not problemi:
        print("tutto a posto: API sana, backup e test notturni al loro posto")
        return 0

    testo = ("I controlli automatici di PharmaTrack hanno trovato qualcosa.\n\n"
             + "\n".join(f"- {p}" for p in problemi)
             + "\n\nNessuna azione automatica e' stata presa.\n"
             + f"Controlli: {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC\n")
    print(testo)
    inviata = manda_mail("PharmaTrack: un controllo automatico non torna", testo)
    print("allarme inviato" if inviata else "allarme NON inviato")
    return 1


if __name__ == "__main__":
    sys.exit(main())

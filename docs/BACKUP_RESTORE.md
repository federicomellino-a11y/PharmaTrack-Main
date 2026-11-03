# Backup e ripristino del database

Il cluster MongoDB Atlas di PharmaTrack è su un piano condiviso, che **non
include backup automatici**. Non esiste quindi una rete di sicurezza lato
Atlas: l'unico salvataggio è quello prodotto da questo repository.

## Come funziona il backup

`.github/workflows/backup-db.yml` gira ogni notte alle 01:30 UTC (02:30 o
03:30 in Italia secondo l'ora legale) e può essere lanciato a mano dalla
scheda Actions → *Backup database* → *Run workflow*.

1. installa `mongodump` sulla macchina di GitHub;
2. scarica tutto il database in un archivio compresso;
3. **rifiuta il backup** se pesa meno di 20 kB, cioè se il dump è vuoto
   (un backup vuoto è peggio di nessun backup, perché sembra che ci sia);
4. cifra l'archivio con AES256 usando la passphrase `BACKUP_PASSPHRASE` e
   cancella il file in chiaro dalla macchina;
5. pubblica come artefatto, conservato **30 giorni**.

Al termine il workflow stampa lo `sha256` dell'archivio: se un giorno il
download sembra corrotto, quello è il valore da confrontare.

Secret richiesti (Settings → Secrets and variables → Actions):
- `MONGO_URL_BACKUP`: stringa di connessione ad Atlas;
- `BACKUP_PASSPHRASE`: passphrase di cifratura. **Senza questa il backup è
  inutile**, perché non è recuperabile: va conservata in un gestore di
  password, non solo qui dentro.

## Ripristinare

Serve una copia locale dell'archivio, scaricata dall'artefatto del run.

```bash
# 1. decifra
gpg --output pharmatrack.archive.gz --decrypt pharmatrack-<data>.asc

# 2. controlla cosa c'è dentro, senza scrivere niente
mongorestore --uri "$MONGO_URL" --archive=pharmatrack.archive.gz --gzip --dryRun
```

Prima di toccare i dati veri, ripristina **in un database di prova** con un
altro nome: è il modo per capire se il backup è completo senza rischiare
niente.

```bash
mongorestore --uri "$MONGO_URL" --archive=pharmatrack.archive.gz --gzip \
  --nsFrom 'Cluster0.*' --nsTo 'ripristino.*'
```

Se il contenuto torna, si ripristina sopra:

```bash
mongorestore --uri "$MONGO_URL" --archive=pharmatrack.archive.gz --gzip \
  --nsFrom 'Cluster0.*' --nsTo 'Cluster0.*' --drop
```

`--drop` cancella le collezioni esistenti prima di riscriverle: è quello che
serve in un ripristino completo, ed è anche il motivo per cui va lanciato
solo dopo aver verificato la copia di prova.

## Verifica dopo il ripristino

1. `GET /api/health` risponde 200;
2. login farmacia e login fattorino funzionano;
3. il conteggio delle consegne e dei clienti coincide con quello atteso;
4. nel browser, dashboard, tracking e archivio si aprono senza errori.

## Cosa questo backup non copre

- **Non è un punto-nel-tempo**: si torna all'ultima notte, non al minuto
  prima dell'errore. Se serve altro, il passo è il piano Atlas con backup
  continui (M10), che è a pagamento.
- **Trenta giorni**: oltre quella soglia gli artefatti vengono eliminati da
  GitHub.
- **Nessun ripristino automatico provato in produzione**: la procedura va
  eseguita a mano, con calma, leggendo i passi.

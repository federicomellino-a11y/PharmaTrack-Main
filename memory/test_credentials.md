# PharmaTrack — Test Credentials

## Pharmacy
- Email: `test@farmaciaprova.it`
- Password: `Test1234!`
- URL: `/login`
- Anche disponibile via pulsante **"Demo Farmacia"** sulla landing (auto-login)

## Driver
- Email: `luca@fattorino.it`
- Password: `Driver123!`
- URL: `/driver/login`
- Anche disponibile via pulsante **"Demo Fattorino"** sulla landing (auto-login)

## Super Admin
- Email: `Admin@superadmin.it`
- Password: `Admin1234!`
- URL: `/admin/login` o `/console-federico` (path nascosto)

## Seed
Per (re)creare i dati di test:
```
cd /app/backend && python seed_data.py
```
(idempotente: non duplica utenti esistenti; ricrea le 5 delivery di test solo se la pharmacy non ne ha)

## Reset DB Test
```
cd /app/backend && python -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path('.env'))
async def reset():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    await db.deliveries.delete_many({})
    await db.driver_shifts.delete_many({})
    await db.notifications.delete_many({})
asyncio.run(reset())
"
```

## URL produzione (Emergent preview)
- Frontend: https://med-inventory-76.preview.emergentagent.com
- API: https://med-inventory-76.preview.emergentagent.com/api

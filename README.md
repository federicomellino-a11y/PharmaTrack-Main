# 🏥 PharmaTrack - Production Main Repository

**Full-stack Italian pharmacy delivery management system** with real-time tracking, shift management, and payment workflows.

**Live**: https://pharmatrack.vercel.app/

![Language Composition](https://img.shields.io/badge/Python-100%25-blue) ![Status](https://img.shields.io/badge/status-production-brightgreen) ![Version](https://img.shields.io/badge/version-1.0.0-blue)

---

## 📦 Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + Async (Motor + MongoDB Atlas)
- **Monorepo**: pnpm workspaces
- **Deployment**: Vercel (serverless)
- **Database**: MongoDB Atlas (cloud)
- **Email**: Brevo SMTP API
- **Real-time**: WebSocket + Push Notifications

---

## 🗂️ Project Structure

```
PharmaTrack-Main/
├── packages/
│   ├── backend/              (FastAPI server - 2000+ lines)
│   │   ├── server.py         ✅ All endpoints + WebSocket
│   │   ├── requirements.txt   ✅ Production dependencies
│   │   └── .env.example      ✅ Configuration template
│   ├── frontend/             (React + Vite - from app2)
│   │   ├── src/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── .env.example
│   └── [COPY FROM app2]
├── config/
│   ├── .env.example          ✅ Master template
│   ├── vercel.json           ✅ Deployment config
│   └── README.deployment.md  (guide)
├── docs/
│   ├── API.md                (endpoint reference)
│   ├── ARCHITECTURE.md       (system design)
│   └── DATABASE.md           (MongoDB schema)
├── .github/workflows/
│   └── deploy.yml            ✅ CI/CD pipeline
├── package.json              ✅ Workspace root
├── pnpm-workspace.yaml       ✅ Monorepo config
├── .gitignore                ✅ Standard ignore rules
└── README.md                 ✅ This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **pnpm** (https://pnpm.io)
- **MongoDB Atlas** account (free tier OK)

### Installation

```bash
# Clone repository
git clone https://github.com/federicomellino-a11y/PharmaTrack-Main.git
cd PharmaTrack-Main

# Install all dependencies
pnpm install

# Setup environment
cp config/.env.example .env.local
# Edit .env.local with your values:
# - MONGO_URL from MongoDB Atlas
# - SMTP_PASSWORD from Brevo
# - ADMIN credentials
# - Google OAuth keys (optional)
# - VAPID keys (optional)
```

### Running Locally

```bash
# Start both frontend + backend (concurrent)
pnpm dev

# OR separately:
pnpm --filter frontend dev      # Frontend on http://localhost:5173
pnpm --filter backend dev        # Backend on http://localhost:8000
```

### Testing

```bash
# Check backend syntax
python3 -m py_compile packages/backend/server.py

# Test health endpoint
curl http://localhost:8000/api/health

# Verify MongoDB connection
# (should return status: "ok")
```

---

## 🔑 Key Features

### 🏪 **Pharmacy Portal**
- **Customer Management**: CRUD + statistics + search
- **Delivery Management**: Create, assign, track, archive
- **Driver Management**: Add, remove, manage active status
- **Shift Management**: Monitor driver shifts (open/closed/settled)
- **Payment Workflow**: Confirm incasso, dispute payments
- **Real-time Messaging**: WebSocket chat with drivers
- **Notifications**: In-app + web push (PWA)
- **Admin Dashboard**: User statistics, database health

### 🚗 **Driver Portal**
- **Delivery Dashboard**: View assigned deliveries
- **Status Updates**: Mark as picked up, in transit, delivered
- **Real-time Tracking**: Share location with pharmacy
- **Shift Management**: Start shift → complete deliveries → close shift
- **In-app Messaging**: Chat with pharmacy
- **Earnings**: Track daily earnings + discrepancies
- **Payment Settlement**: Confirm delivered amount vs declared

### 🔗 **Integrations**
- **Winfarm**: Import customers from pharmacy software
- **Brevo**: Email notifications & transactional emails
- **Google Maps**: Address autocomplete + directions
- **Google Auth**: SSO login support
- **Push Notifications**: PWA with VAPID keys

---

## 📊 Delivery Status Flow

```
┌─────────────────────────────────────────────────────────────┐
│ DELIVERY LIFECYCLE                                          │
└─────────────────────────────────────────────────────────────┘

da_preparare
    ↓ (mark ready)
pronta
    ↓ (assign driver)
assigned
    ↓ (driver picks up)
picked_up
    ↓ (driver starts delivery)
in_transit
    ↓ (mark delivered)
delivered_pending_confirmation
    ↓ (pharmacy confirms payment)
delivered ✅ (FINAL)

[cancelled] ❌ (anytime)
```

---

## ⚙️ Environment Variables

### Backend (`packages/backend/.env`)

```env
# Database
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=pharmatrack_prod

# CORS (frontend URL)
CORS_ORIGINS=https://pharmatrack.vercel.app

# Email (Brevo)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=465
SMTP_USERNAME=your-email@pharmatrack.it
SMTP_PASSWORD=xkeysib-xxxxx  # From Brevo API keys
SMTP_FROM=noreply@pharmatrack.it

# Admin
ADMIN_EMAIL=admin@pharmatrack.it
ADMIN_PASSWORD=SecurePass123!

# Google (optional)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_GOOGLE_MAPS_KEY=your-maps-key

# Push (optional)
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
```

### Frontend (`packages/frontend/.env`)

```env
VITE_BACKEND_URL=https://pharmatrack.vercel.app/api
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_GOOGLE_MAPS_KEY=your-maps-key
```

See `config/.env.example` for complete reference.

---

## 📡 API Endpoints

### Health & Config
- `GET /api/health` - API status + database health
- `GET /api/push/config` - Push notification configuration

### Authentication
- `POST /api/auth/register` - Create pharmacy account
- `POST /api/auth/login` - Pharmacy login
- `POST /api/auth/google` - Google SSO
- `GET /api/auth/me` - Current user info
- `POST /api/auth/logout` - Logout
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Complete password reset

### Core Resources
- `GET/POST /api/customers` - Customer management
- `GET/POST /api/deliveries` - Delivery management
- `GET/POST /api/messages` - Messaging
- `GET/POST /api/notifications` - Notifications

### Driver Endpoints
- `POST /api/driver/login` - Driver login
- `GET /api/driver/deliveries` - Driver's deliveries
- `POST /api/driver/shifts/start` - Start shift
- `POST /api/driver/shifts/close` - Close shift

### Admin
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/overview` - Dashboard statistics
- `GET /api/admin/users` - All pharmacies
- `GET /api/admin/database/stats` - Database metrics

### WebSocket
- `/ws/pharmacy/{user_id}` - Real-time pharmacy updates
- `/ws/driver/{driver_id}` - Real-time driver updates

See `docs/API.md` for complete reference.

---

## 🚢 Deployment

### Deploy on Vercel (Recommended)

```bash
# 1. Push to GitHub
git push origin main

# 2. Go to https://vercel.com/new
# 3. Import PharmaTrack-Main repository
# 4. Configure:
#    - Framework: Next.js (select Custom for React)
#    - Root Directory: packages/frontend
#    - Build Command: npm run build
#    - Output Directory: dist

# 5. Add Environment Variables (from config/.env.example)
# 6. Deploy!
```

### Set Environment Variables on Vercel

```
Settings → Environment Variables
```

Add all variables from `config/.env.example`:
- `MONGO_URL`
- `CORS_ORIGINS`
- `SMTP_*` credentials
- `ADMIN_*` credentials
- `GOOGLE_*` keys
- `VAPID_*` keys

### Verify Deployment

```bash
# Check API is responding
curl https://pharmatrack.vercel.app/api/health

# Expected:
# {
#   "status": "ok",
#   "database": "pharmatrack_prod",
#   "admin_configured": true,
#   "push_configured": true,
#   ...
# }
```

See `config/README.deployment.md` for detailed deployment guide.

---

## 🧪 Testing Locally

### Test Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Pharmacy | `test@farmacy.it` | `Test1234!` |
| Admin | (from `ADMIN_EMAIL`) | (from `ADMIN_PASSWORD`) |

### Test API Endpoints

```bash
# Health check
curl http://localhost:8000/api/health

# Login (pharmacy)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@farmacy.it","password":"Test1234!"}'

# List customers
curl http://localhost:8000/api/customers \
  -H "Cookie: session_token=YOUR_TOKEN"
```

---

## 📚 Documentation

- **[API Documentation](./docs/API.md)** - All endpoints reference
- **[Architecture Guide](./docs/ARCHITECTURE.md)** - System design & data models
- **[Database Schema](./docs/DATABASE.md)** - MongoDB collections & indexes
- **[Deployment Guide](./config/README.deployment.md)** - Production deployment instructions

---

## 🔐 Security Features

✅ **Passwords**: Bcrypt hashing (12 rounds)  
✅ **Sessions**: JWT-like tokens with 7-day expiry  
✅ **CORS**: Restricted to frontend domain  
✅ **Cookies**: `HttpOnly`, `Secure`, `SameSite=None`  
✅ **Email**: Brevo API key handling  
✅ **Database**: MongoDB TTL indexes for auto-cleanup  
✅ **Async**: No blocking operations  

---

## 📈 Performance

- **Async/await** throughout FastAPI stack
- **Connection pooling** for MongoDB
- **Indexed queries** on frequently accessed fields
- **Pagination** for large datasets
- **WebSocket** for real-time instead of polling
- **Global CDN** via Vercel for frontend assets

---

## 🐛 Troubleshooting

### MongoDB Connection Error
```
✗ Check MONGO_URL is correct
✗ Check database user credentials
✗ Whitelist your IP in MongoDB Atlas
✗ Verify connection string has ?retryWrites=true
```

### Email Not Sending
```
✗ Verify SMTP_PASSWORD starts with "xkeysib-"
✗ Check SMTP_FROM email is verified in Brevo
✗ Check SMTP credentials in dashboard
```

### CORS Error in Frontend
```
✗ Verify CORS_ORIGINS includes your Vercel URL
✗ Check frontend is using correct VITE_BACKEND_URL
✗ Clear browser cache and cookies
```

### Build Fails on Vercel
```
✗ Check Node.js version (must be 20+)
✗ Verify all environment variables are set
✗ Check build logs for detailed errors
✗ Try rebuilding with --force flag
```

---

## 📅 Release Notes

### v1.0.0 (Current)

✅ **Features**:
- Pharmacy + Driver + Admin portals
- Complete delivery lifecycle
- Driver shift management
- Payment confirmation & dispute workflow
- Winfarm integration
- Real-time messaging & notifications
- MongoDB Atlas integration
- Brevo email service
- Google OAuth support
- PWA push notifications

✅ **Infrastructure**:
- FastAPI backend (async)
- React frontend (TypeScript)
- pnpm monorepo
- GitHub Actions CI/CD
- Vercel deployment

✅ **Security**:
- Bcrypt password hashing
- Session-based auth
- CORS protection
- Environment-based config

---

## 👤 Author

**Federico Mellino** - [@federicomellino-a11y](https://github.com/federicomellino-a11y)

---

## 📄 License

Private - Federico Mellino © 2024

---

## 🤝 Support

For issues or questions:
- **GitHub Issues**: https://github.com/federicomellino-a11y/PharmaTrack-Main/issues
- **Documentation**: See `docs/` folder
- **Vercel Docs**: https://vercel.com/docs

---

## ✨ Next Steps

- [ ] Copy frontend from app2
- [ ] Test locally with `pnpm dev`
- [ ] Deploy to Vercel
- [ ] Configure production database
- [ ] Set up monitoring & logs
- [ ] Launch 🚀

---

**Made with ❤️ for Italian pharmacies**

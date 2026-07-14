import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / '.env')

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USERNAME
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "true").lower() == "true"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL") or os.getenv("SUPERADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or os.getenv("SUPERADMIN_PASSWORD")
ADMIN_NAME = os.getenv("ADMIN_NAME") or os.getenv("SUPERADMIN_NAME") or "Super Admin"
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:support@pharmatrack.app")

# Base URL del frontend per i link nelle email (verifica/reset)
APP_BASE_URL = (os.getenv("APP_BASE_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")

# Rate limit su endpoint sensibili (override via env, es. nei test)
LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5/minute")
REGISTER_RATE_LIMIT = os.getenv("REGISTER_RATE_LIMIT", "3/minute")
FORGOT_RATE_LIMIT = os.getenv("FORGOT_RATE_LIMIT", "3/minute")

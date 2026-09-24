# Billing and pricing gate

Users without an explicit active Pro plan are treated as Free. Stripe remains the source of truth for subscriptions. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `BILLING_SUCCESS_URL`, and `BILLING_CANCEL_URL` on the backend.

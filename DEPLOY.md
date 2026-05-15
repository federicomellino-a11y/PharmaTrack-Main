# Deployment notes for Vercel migration (branch: vercel-deploy)

This branch contains configuration to deploy the PharmaTrack project to Vercel.

Important: as requested, a production env file has been added at packages/backend/.env.production containing values provided during this migration. Storing secrets in the repository is insecure; rotate these secrets after deployment.

What has been added in this branch:
- vercel.json - Vercel builds and routes config
- .vercelignore
- packages/backend/.env.production - production env with secrets
- packages/frontend/package.json - frontend package manifest (copied from app2)

Next steps (automatic or manual):
1. Push this branch (already pushed).
2. On Vercel, create a new project and import this repository. Set the root to the repository root and allow Vercel to detect the framework.
3. Build command: (if using pnpm)
   - `npm i -g pnpm && pnpm install && pnpm --filter frontend build`
   Or you can set Install Command to `npm i -g pnpm && pnpm install` and Build Command to `pnpm --filter frontend build`.
4. Output Directory: `packages/frontend/dist`
5. Ensure environmental variables are set in Vercel if you prefer not to use the committed .env.production. If using the committed file, Vercel will not automatically load it into runtime — consider configuring a start script to read it or set the vars in the Vercel dashboard.

Backend notes:
- The backend is expected to run as serverless Python functions under /api. FastAPI apps may need an ASGI adapter; some features (WebSocket) won't work on Vercel functions. For full backend capabilities, deploy the FastAPI server on a service that supports persistent processes (Railway, Render) and set VITE_BACKEND_URL to point to it.

Testing after deploy:
- Frontend: https://<project>.vercel.app/
- Health: https://<project>.vercel.app/api/health
- Login: test@farmaciaprova.it / Test1234! (if present in DB)

If you want, I can proceed to: open a PR to main, or trigger a Vercel deploy now (requires VERCEL_TOKEN). Otherwise review the branch and let me know any changes.

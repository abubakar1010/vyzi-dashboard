# VYZI Dashboard

Admin dashboard for **VYZI**, the Italian energy bill comparison and switching
platform. Admins review uploaded bills, process switching cases, manage
suppliers and offers, and handle support.

Built with React 19, TypeScript, Vite 7, Ant Design 5, Tailwind CSS 4 and
Redux Toolkit (RTK Query). It talks to the VYZI backend at `api/v1`.

## Getting started

```bash
npm ci
npm run dev
```

## Configuration

Set in `.env.development` / `.env.production` (read at build time):

| Variable | Purpose |
|---|---|
| `VITE_SERVER_URL` | Backend API base, ending in `/api/v1/` (e.g. `https://api.vyzi.it/api/v1/`) |
| `VITE_FIREBASE_*` | Optional desktop push notifications; leave blank to rely on in-app polling |

The backend must list the dashboard's origin in `CORS_ORIGINS`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check, Italian/English text audit, production build into `dist/` |
| `npm run i18n:check` | Text audit only: no hard-coded UI text, no missing translations |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build locally |

## Language

Italian is the default and fallback; English is a translation. All UI text
lives in the locale files under `src/i18n/locales/`.

## Deployment

The build output in `dist/` is static and is served by Nginx. See
`docs/deployment.md` in the backend repository for the release steps.

# Deploying Bubble Notes on Vercel

The repo deploys as **one Vercel project with two services** (`vercel.json`):

| Service | Folder | What it is | Public path |
| --- | --- | --- | --- |
| `app` | `.` (repo root) | The Vite web app (`npm run build` → `dist/`) | everything else (`/`) |
| `api` | `server/` | The Node API (`server/vercel.mjs` → same routes as `npm run api`) | `/api/*` |

The browser calls relative `/api/...` paths, so it reaches the API through the `/api/*` rewrite. No bindings are needed. Anatomy Live (`/api/draw`) runs inside the API from a prebuilt bundle in `server/vendor/`.

Vercel Services are in **Beta**.

## One-time setup (Vercel website, no CLI needed)

1. Go to https://vercel.com/new and sign in with GitHub.
2. Import the repository **SidKarthik999/BubbleGuppies**. Keep the **Root Directory** as the repo root (`./`); `vercel.json` defines the services.
3. Before deploying, open **Environment Variables** and add:
   - `OPENROUTER_API_KEY` = your OpenRouter key (required for analysis, handwriting assist, and live sketches)
   - Optional: `OPENROUTER_MODEL`, `OPENROUTER_REASONING_EFFORT`, `ANATOMY_LIVE_MODEL`, `ANATOMY_LIVE_PROVIDER` (defaults are in `server/.env.example`)
4. Click **Deploy**.
5. When it finishes, open `https://<your-project>.vercel.app/api/health`. It should return `{"ok":true}`.
6. Open `https://<your-project>.vercel.app`, set **Analysis** to **Real API**, and press **Start sample**.

After this, every push to `main` redeploys automatically.

## Optional: test locally the way Vercel runs it

```bash
npm install -g vercel
```

```bash
vercel link
```

```bash
vercel env pull
```

```bash
vercel dev
```

## Maintenance

- If you change anything in `anatomy-live/`, regenerate the API's copy and commit it:

```bash
node server/scripts/vendor-anatomy-live.mjs
```

  The test `server/test/draw-vendor.test.mjs` fails when the copy is out of date.
- Server tests: `node --test 'server/test/*.test.mjs'`.

## Known limits

- **Function time limits.** Analyze calls take about 2–6 s, the web fallback up to about 20 s, and sketch streams a few seconds. On plans with a short default timeout, very long requests may be cut off. If that happens, raise the function duration for the `api` service in the Vercel dashboard.
- **Never commit `server/.env`.** Keys go in Vercel's Environment Variables only.

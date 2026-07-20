# Match · 火柴

> This air is roughly how many matches burning.

Minimal air visualization: one match on white. Dirtier air becomes a cluster, then a bonfire.

<p align="center">
  <img src="public/icon.svg" alt="Match" width="96" />
</p>

**Language:** English · [中文](README.zh-CN.md)

## Features

- **Ignite ritual** — strike motion + short SFX, count-up, staged growth
- **Pollution forms** — single / cluster / bonfire; near-clean air barely burns
- **Failure state** — smolders when air is unavailable (no tech error dump)
- **Time & history** — “updated …”, same-city 24h delta
- **Daypart & weather mood** — light/smoke only, not a dashboard
- **Share card** — portrait / square, optional city hide; Canvas reuses fire drawing
- **中 / EN** — header toggle, or `Ctrl/⌘ + L`
- **PWA** — installable shell + custom 404
- **Request guard** — cache, cooldown, dedupe, multi-source race
- **Secrets stay server-side** — Node / gateway inject only

## Quick start

```bash
npm install
cp .env.example .env   # optional but recommended
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server + API proxy |
| `npm run build` | Production build |
| `npm run preview` | Preview build (with proxy) |
| `npm test` | Unit tests |

## Configuration

Copy [`.env.example`](.env.example) → `.env`.

| Variable | Purpose | In browser bundle? |
|----------|---------|--------------------|
| `AMAP_KEY` | Amap IP + geocode + weather | **No** |
| `QWEATHER_KEY` | QWeather (HeWeather) air quality — **preferred** | **No** |
| `QWEATHER_HOST` | Optional API host (default `devapi.qweather.com`) | **No** |
| `CAIYUN_TOKEN` | Caiyun AQI fallback | **No** |
| `WAQI_TOKEN` | WAQI fallback (default `demo`) | **No** |

> **Do not use a `VITE_` prefix for secrets.**  
> `VITE_*` is inlined into client JS.

The app calls same-origin `/api/*` for keyed providers. Secrets are injected only at the edge / proxy.

| Environment | How secrets are read |
|-------------|----------------------|
| **Local** (`npm run dev`) | Vite proxy from `.env` |
| **Vercel** | Project env → Edge functions in [`api/`](api/) |
| **Cloudflare Pages** | Project env → Functions in [`functions/api/`](functions/api/) |
| **Nginx** | Gateway rewrite — [`deploy/nginx.example.conf`](deploy/nginx.example.conf) |

Shared proxy logic: [`server/proxy.mjs`](server/proxy.mjs).  
Without keys, air falls back to **Open-Meteo** (public).

### API abuse protection

Keyed `/api/*` routes on Vercel / Cloudflare require:

1. Header `X-Match-Client: 1` (set by the app’s `fetchJson`)
2. If `Origin` / `Referer` is present, it must match the site origin

Cross-site simple requests cannot set the custom header; preflight is not allowed.  
This is CSRF / casual scrape protection — not a substitute for rate limits or key rotation.

### Amap console

Enable at least:

1. **IP location**
2. **Geocoding** (city → coords when needed)
3. **Weather** (optional; smoke mood)

## Deploy

### Vercel

1. Import the Git repo (Framework: Vite).
2. **Settings → Environment Variables** (Production + Preview):

   | Name | Required |
   |------|----------|
   | `AMAP_KEY` | recommended |
   | `QWEATHER_KEY` | recommended（空气优先） |
   | `QWEATHER_HOST` | optional |
   | `CAIYUN_TOKEN` | optional fallback |
   | `WAQI_TOKEN` | optional (`demo`) |

3. Deploy. Routes under `/api/amap/*`, `/api/qweather/*`, `/api/caiyun/*`, `/api/waqi/*` are handled by Edge functions.

### Cloudflare Pages

1. Connect the repo. Build: `npm run build`, output: `dist`.
2. **Settings → Environment variables** (Production + Preview): same three names as above.
3. Functions live in [`functions/api/`](functions/api/).  
   [`public/_routes.json`](public/_routes.json) routes `/api/*` to Functions.

Optional local config: [`wrangler.toml`](wrangler.toml).

## How it works

```
public IP → city (approx)
         → geocode / Amap IP rectangle → coarse lat/lon
         → AQI / PM2.5 (QWeather → Caiyun → WAQI → Open-Meteo)
         → matches/hour ≈ concentration × 0.5 ÷ 8
         → clean · match · cluster · bonfire
```

### Location

- **City-level only** — no browser geolocation prompt
- Prefers domestic IP clues (overseas libs often mislabel CN IPv6 as Beijing)
- Never treats missing coords as `0,0` (Null Island)
- CORS-blocked browser sources are not used

### Air quality

- Priority: **QWeather (CN station)** → Caiyun → WAQI → Open-Meteo model
- Prefer China AQI (`cn-mee` / concentration-derived); reject bogus `pm25=0`
- UI can show both PM2.5 and AQI

### Match conversion

Illustrative only — not a lab emission factor:

```
matchesPerHour ≈ concentration × 0.5 ÷ 8
```

| Mode | Rough threshold |
|------|-----------------|
| clean | concentration ≤ 2 (barely lit) |
| match | low |
| cluster | AQI ≥ 75 or matches ≥ 3 |
| bonfire | AQI ≥ 150 or matches ≥ 8 |

### Interactions

| Action | Behavior |
|--------|----------|
| **Ignite** | Start ritual (clean air: soft strike, no full burn) |
| **Click city** | Soft refresh (cooldown; force-capable) |
| **Share** | Card sheet |
| **中 / EN** | Language |
| `Enter` / `Space` | Ignite |
| `Ctrl/⌘ + L` | Toggle language |

## Project layout

```text
.
├── api/                     # Vercel Edge: /api/amap|caiyun|waqi/*
├── functions/api/           # Cloudflare Pages Functions
├── server/
│   └── proxy.mjs            # shared secret injection + upstream fetch
├── deploy/
│   └── nginx.example.conf
├── public/
│   ├── 404.html
│   ├── _routes.json         # CF: only /api/* → Functions
│   ├── icon.svg
│   ├── manifest.webmanifest
│   └── sw.js
├── src/
│   ├── components/
│   ├── i18n/
│   ├── services/
│   ├── styles/
│   ├── utils/
│   ├── App.vue
│   └── main.js
├── .env.example
├── vercel.json
├── wrangler.toml
├── README.md
├── README.zh-CN.md
├── index.html
├── package.json
└── vite.config.js
```

### Shared modules

| Module | Used by |
|--------|---------|
| `fireMode.js` | DOM scene + share Canvas layout |
| `drawFire.js` | Share cards / static fire |
| `city.js` | City label localization |
| `aqi.js` | Count, intensity, clean flag |

## Recent updates

- Bonfire visuals (log teepee, not match pile)
- Share card redesign; fire drawing extracted to `drawFire`
- City-level IP location; reject `0,0` coords
- Air multi-source race; bogus `pm25=0` falls back to AQI
- Clean-air ember + soft ignite
- Header layout / hit targets / louder strike SFX
- Custom `404.html` + nginx example

## Security

- Non-`VITE_` secret names only
- Client errors sanitized
- Production: no sourcemaps, hashed assets, `console` stripped
- `.env` gitignored — commit `.env.example` only

## Stack

- Vue 3 + Vite 6
- Web Audio (strike only)
- Canvas share cards
- Vitest

## License

MIT — data belongs to the respective providers (Amap / Caiyun / WAQI / Open-Meteo / ipwho / ipip).

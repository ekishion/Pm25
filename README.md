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
- **Off-scale** — above national PM2.5 cap, label “off-scale” without hiding the number
- **Failure / quota** — smolder when air fails; stop service when daily API limit is hit
- **Time & history** — “updated …”, same-city 24h delta (re-translates on language switch)
- **Daypart & weather mood** — light/smoke only, not a dashboard
- **Share card** — portrait / square; Canvas reuses fire drawing
- **中 / EN** — city label via reverse geocoding language, not a static dictionary
- **PWA** — installable shell + custom 404
- **Request guard** — cache, cooldown, dedupe, prioritized multi-source air fetch
- **Secrets server-side** — Vite / Vercel / Cloudflare inject keys into `/api/*`

## Quick start

```bash
npm install
cp .env.example .env   # recommended
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server + API proxy + CSRF/quota guard |
| `npm run build` | Production build |
| `npm run preview` | Preview build (with proxy) |
| `npm test` | Unit tests |
| `npm run lint` | ESLint (Vue + JS) |

## Configuration

Copy [`.env.example`](.env.example) → `.env`.

| Variable | Purpose | In browser? |
|----------|---------|-------------|
| `AMAP_KEY` | Amap IP + geocode + weather | **No** |
| `QWEATHER_KEY` | QWeather air quality (**preferred**) | **No** |
| `QWEATHER_HOST` | Optional API host (default `devapi.qweather.com`) | **No** |
| `CAIYUN_TOKEN` | Caiyun air fallback | **No** |
| `WAQI_TOKEN` | WAQI fallback (default `demo`) | **No** |
| `DAILY_API_LIMIT` | Max upstream `/api` calls per UTC day (default `200`; `0` = unlimited) | **No** |

> **Do not prefix secrets with `VITE_`.** Those are inlined into client JS.

### Where secrets are read

| Environment | Mechanism |
|-------------|-----------|
| Local `npm run dev` | Vite proxy + middleware from `.env` |
| Vercel | Project env → [`api/[...path].js`](api/[...path].js) |
| Cloudflare Pages | Project env → [`functions/api/[[path]].js`](functions/api/[[path]].js) |
| Nginx | Gateway rewrite — [`deploy/nginx.example.conf`](deploy/nginx.example.conf) |

Shared logic: [`server/proxy.mjs`](server/proxy.mjs) + [`server/quota.mjs`](server/quota.mjs).

### API protection

1. **CSRF / casual scrape** — require header `X-Match-Client: 1`; same-origin `Origin`/`Referer` when present  
2. **Daily quota** — `DAILY_API_LIMIT` via in-memory Map in [`server/quota.mjs`](server/quota.mjs)  
   - **Serverless caveat:** each Vercel Edge / Cloudflare isolate has its own memory. Concurrent instances do **not** share the counter, so the real global cap can scale with active isolates (`limit × instances`).  
   - For a hard global daily cap, use Cloudflare KV / Durable Objects, Vercel KV (Upstash), or platform rate limits.  
   - Over limit → `429` + UI “daily limit reached”.  
3. Not a full WAF — add platform rate limits if you need hard multi-instance caps  

### Amap console

Enable at least: **IP location**, **Geocoding**, optional **Weather**.

### QWeather

Create a key at [dev.qweather.com](https://dev.qweather.com/).  
`QWEATHER_HOST` only if the console gives a dedicated API host.

## Deploy

### Vercel

1. Import repo (Framework: Vite).  
2. Set env (Production + Preview): `AMAP_KEY`, `QWEATHER_KEY`, optional others + `DAILY_API_LIMIT`.  
3. Deploy. All `/api/*` → single Edge function [`api/[...path].js`](api/[...path].js).  
4. After env changes: **Redeploy**.

### Cloudflare Pages

1. Build `npm run build`, output `dist`.  
2. Same env vars.  
3. Function: [`functions/api/[[path]].js`](functions/api/[[path]].js); [`public/_routes.json`](public/_routes.json) sends `/api/*` to Functions.

## How it works

```
public IP → city (approx)
         → geocode (prefer city name → coords; never keep foreign IP coords for a CN city)
         → place label (reverse geocode language = UI locale)
         → AQI / PM2.5: QWeather → Caiyun → WAQI → Open-Meteo
         → matches/hour ≈ concentration × 0.5 ÷ 8
         → intensity = 1 − exp(−c / 90)
         → clean · match · cluster · bonfire · off-scale
```

### Location

- City-level only (no geolocation prompt)
- Domestic IP clues preferred; overseas IPv6 often mislabels Beijing
- Reject `0,0`; geocode trusted city names instead of reusing wrong IP coords

### Place names

- No large city dictionary
- Coords → BigDataCloud reverse geocode (`localityLanguage`)
- Name only → Open-Meteo geocoding (`language=zh|en`)
- Session cache per locale

### Air quality

| Priority | Source | Notes |
|----------|--------|--------|
| 1 | QWeather | CN station / `cn-mee` when available |
| 2 | Caiyun | `aqi.chn` preferred |
| 3 | WAQI | AQI derived from PM2.5 when possible |
| 4 | Open-Meteo | Model only; overall deadline forces fallback |

Also: overall fetch deadline (~6.5s); US-AQI drift correction from PM2.5 (HJ 633).

### Match conversion

Illustrative — not a lab emission factor:

```
matches/hour ≈ concentration × 0.5 ÷ 8
intensity    = 1 − exp(−concentration / 90)
```

| Mode | Rough rule |
|------|------------|
| clean | concentration ≤ 2 |
| match | low |
| cluster | matches ≥ 3 or AQI ≥ 75 |
| bonfire | matches ≥ 8 or AQI ≥ 150 |
| off-scale | concentration > 500 μg/m³ |

### Interactions

| Action | Behavior |
|--------|----------|
| **Ignite** | Ritual (clean: soft strike) |
| **Click city** | Soft refresh |
| **Share** | Card sheet |
| **中 / EN** | Language + re-resolve city label |
| `Enter` / `Space` | Ignite |
| `Ctrl/⌘ + L` | Toggle language |

## Project layout

```text
.
├── api/[...path].js           # Vercel Edge catch-all
├── functions/api/[[path]].js  # Cloudflare catch-all
├── server/
│   ├── proxy.mjs              # CSRF, quota, secret inject, upstream
│   └── quota.mjs              # daily limit (in-memory)
├── deploy/nginx.example.conf
├── public/                    # 404, PWA, CF _routes
├── src/
│   ├── components/            # MatchScene (+ MatchScene.css), ShareSheet
│   ├── composables/           # useAirQuality, useMatchStage, useTimers, useAudioGesture
│   ├── services/              # location, air, weather, placeName, audio, http
│   ├── utils/                 # aqi, fireMode, drawFire, city, safe, …
│   ├── i18n/
│   ├── styles/
│   ├── App.vue
│   └── main.js
├── .env.example
├── eslint.config.js
├── vercel.json
├── wrangler.toml
├── README.md
└── README.zh-CN.md
```

## Recent updates

- QWeather first for CN air; catch-all Vercel/CF `/api` (fixes production 404)
- Daily API quota (`DAILY_API_LIMIT`) + off-scale / quota UI copy
- Continuous burn intensity curve; `offScale` flag
- City labels via reverse geocoding language (no dictionary table)
- CSRF single source of truth; upstream + air overall timeouts
- MatchScene CSS extracted; ESLint; system fonts (no Google Fonts)
- i18n history lines re-translate on language switch

## Security

- Non-`VITE_` secrets only  
- Client errors sanitized  
- Production: no sourcemaps, hashed assets, stripped `console`  
- `.env` gitignored  

## Stack

Vue 3 · Vite 6 · Web Audio (strike) · Canvas share cards · Vitest · ESLint  

## License

MIT — data belongs to providers (Amap / QWeather / Caiyun / WAQI / Open-Meteo / BigDataCloud / ipwho / ipip).

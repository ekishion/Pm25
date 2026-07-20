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
| `CAIYUN_TOKEN` | Caiyun realtime AQI | **No** |
| `WAQI_TOKEN` | WAQI fallback (default `demo`) | **No** |

> **Do not use a `VITE_` prefix for secrets.**  
> `VITE_*` is inlined into client JS.

The app calls same-origin `/api/*` for keyed providers. Vite injects keys in **dev / preview**.  
Production: reverse-proxy the same routes — see [`deploy/nginx.example.conf`](deploy/nginx.example.conf).

Without keys/proxy, air falls back to **Open-Meteo** (public).

### Amap console

Enable at least:

1. **IP location**
2. **Geocoding** (city → coords when needed)
3. **Weather** (optional; smoke mood)

## How it works

```
public IP → city (approx)
         → geocode / Amap IP rectangle → coarse lat/lon
         → AQI / PM2.5 (Caiyun → WAQI → Open-Meteo, race)
         → matches/hour ≈ concentration × 0.5 ÷ 8
         → clean · match · cluster · bonfire
```

### Location

- **City-level only** — no browser geolocation prompt
- Prefers domestic IP clues (overseas libs often mislabel CN IPv6 as Beijing)
- Never treats missing coords as `0,0` (Null Island)
- CORS-blocked browser sources are not used

### Air quality

- Parallel race; first valid reading wins
- If `pm25=0` but `aqi>2`, zero is treated as missing → use AQI
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
├── deploy/
│   └── nginx.example.conf
├── public/
│   ├── 404.html
│   ├── icon.svg
│   ├── manifest.webmanifest
│   └── sw.js
├── src/
│   ├── components/          # MatchScene, ShareSheet
│   ├── i18n/
│   ├── services/            # location, air, weather, audio, http
│   ├── styles/
│   ├── utils/               # aqi, city, fireMode, drawFire, shareCard, …
│   ├── App.vue
│   └── main.js
├── .env.example
├── README.md                # English
├── README.zh-CN.md          # 中文
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

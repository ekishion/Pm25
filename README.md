# 火柴 · Match

> 此刻空气，相当于多少根火柴在燃烧。

极简空气可视化：白底中央一根火柴。污染升高时变成一簇，再高则成火堆。

<p align="center">
  <img src="public/icon.svg" alt="Match" width="96" />
</p>

## Features

- **点燃仪式** — 擦燃动效 + 短音效，数字 count-up，形态分步生长  
- **污染形态** — 单根 / 一簇 / 火堆，烟雾气质随浓度变化  
- **失败态** — 读不到空气时阴燃，不展示技术错误  
- **时间与历史** — 「更新于…」、同城 24h 对比上次  
- **日夜与天气气质** — 只影响光感与烟火，不做仪表盘  
- **分享卡片** — 竖版 / 方形预览，可隐藏城市  
- **中 / 英** — 顶栏切换，或 `Ctrl/⌘ + L`  
- **PWA** — 可添加到主屏幕，离线壳  
- **请求节流** — 缓存、冷却、并发去重  
- **密钥不进前端** — 仅 Node / 网关注入  

## Quick start

```bash
npm install
cp .env.example .env   # optional
npm run dev
```

Open the local URL printed by Vite (default `http://localhost:5173`).

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
| `AMAP_KEY` | Amap IP geolocation | **No** |
| `CAIYUN_TOKEN` | Caiyun realtime AQI | **No** |
| `WAQI_TOKEN` | WAQI fallback (default `demo`) | **No** |

> **Do not use a `VITE_` prefix for secrets.**  
> `VITE_*` is inlined into client JS. Keys must stay server-side.

The app only calls same-origin `/api/*`. Vite injects keys in **dev / preview**.  
For production, put the same reverse proxy on your gateway — see [`deploy/nginx.example.conf`](deploy/nginx.example.conf).

Without a proxy, the app falls back to **Open-Meteo** (public, no key).

## How it works

```
IP / geo → city + lat/lon
        → AQI / PM2.5
        → matches/hour ≈ PM2.5 × 0.5 ÷ 8
        → match · cluster · bonfire
```

This conversion is **illustrative**, not a lab emission factor.

### Interactions

| Action | Behavior |
|--------|----------|
| **Ignite** | Start the ritual |
| **Click city name** | Soft refresh (cooldown) |
| **Share** | Card preview sheet |
| **中 / EN** | Language |
| `Enter` / `Space` | Ignite (keyboard) |
| `Ctrl/⌘ + L` | Toggle language |

## Project layout

```text
.
├── deploy/
│   └── nginx.example.conf   # production proxy sketch
├── public/
│   ├── icon.svg
│   ├── manifest.webmanifest
│   └── sw.js                # minimal offline shell
├── src/
│   ├── components/          # MatchScene, ShareSheet
│   ├── i18n/
│   ├── services/            # location, air, weather, audio, http
│   ├── styles/
│   ├── utils/               # aqi, cache guard, share card, …
│   ├── App.vue
│   └── main.js
├── .env.example
├── index.html
├── package.json
└── vite.config.js
```

## Security notes

- Secrets use **non-`VITE_`** env names and never ship in the client bundle  
- Client errors are sanitized (paths / token-like strings redacted)  
- Production build: no sourcemaps, hashed assets, `console` stripped  
- `.env` is gitignored — only commit `.env.example`  

## Stack

- Vue 3 + Vite 6  
- Web Audio (strike only)  
- Canvas share cards  
- Vitest  

## License

MIT — use freely; data belongs to the respective providers (Amap / Caiyun / WAQI / Open-Meteo).

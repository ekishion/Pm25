# 火柴 · Match

> 此刻空气，相当于多少根火柴在燃烧。

极简空气可视化：白底中央一根火柴。污染升高时变成一簇，再高则成篝火。

<p align="center">
  <img src="public/icon.svg" alt="火柴" width="96" />
</p>

**语言：** [English](README.md) · 中文

## 功能

- **点燃仪式** — 擦燃动效 + 短音效，数字 count-up，形态分步生长
- **污染形态** — 单根 / 一簇 / 篝火；极净空气几乎不燃
- **失败态** — 读不到空气时阴燃，不展示技术错误
- **时间与历史** — 「更新于…」、同城 24h 对比上次
- **日夜与天气气质** — 只影响光感与烟火，不做仪表盘
- **分享卡片** — 竖版 / 方形预览，可隐藏城市；Canvas 与主场景共用火候绘制
- **中 / 英** — 顶栏切换，或 `Ctrl/⌘ + L`
- **PWA** — 可添加到主屏幕，离线壳 + 自定义 404
- **请求节流** — 缓存、冷却、并发去重、多源抢跑
- **密钥不进前端** — 仅 Node / 网关注入

## 快速开始

```bash
npm install
cp .env.example .env   # 建议填写
npm run dev
```

打开 Vite 打印的地址（默认 `http://localhost:5173`）。

### 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务 + API 代理 |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览构建（带代理） |
| `npm test` | 单元测试 |

## 配置

复制 [`.env.example`](.env.example) → `.env`。

| 变量 | 用途 | 是否打进浏览器包 |
|------|------|------------------|
| `AMAP_KEY` | 高德 IP + 地理编码 + 天气 | **否** |
| `CAIYUN_TOKEN` | 彩云实时空气 | **否** |
| `WAQI_TOKEN` | WAQI 备用（默认 `demo`） | **否** |

> **密钥不要使用 `VITE_` 前缀。**  
> `VITE_*` 会被内联进前端 JS。

带密钥的服务一律走同源 `/api/*`。密钥只在边缘 / 代理运行时读取，不进浏览器包。

| 环境 | 密钥如何注入 |
|------|----------------|
| **本地**（`npm run dev`） | Vite 代理读 `.env` |
| **Vercel** | 项目环境变量 → [`api/`](api/) Edge 函数 |
| **Cloudflare Pages** | 项目环境变量 → [`functions/api/`](functions/api/) |
| **Nginx** | 网关重写 — [`deploy/nginx.example.conf`](deploy/nginx.example.conf) |

共用代理逻辑：[`server/proxy.mjs`](server/proxy.mjs)。  
无密钥时，空气回退到 **Open-Meteo**（公开源）。

### API 防盗用（CSRF / 简单跨站）

Vercel / Cloudflare 上的 `/api/*` 要求：

1. 请求头 `X-Match-Client: 1`（前端 `fetchJson` 自动带上）
2. 若有 `Origin` / `Referer`，必须与当前站点同源

跨站简单请求带不上自定义头；预检也不会放行。  
这是防 CSRF / 随手盗刷，**不能替代**限流或密钥轮换。

### 高德控制台

至少开通：

1. **IP 定位**
2. **地理编码**（城市名 → 坐标，缺坐标时用）
3. **天气查询**（可选，影响烟雾气质）

## 部署

### Vercel

1. 导入 Git 仓库（Framework: Vite）。
2. **Settings → Environment Variables**（Production + Preview）写入：

   | 变量 | 是否必需 |
   |------|----------|
   | `AMAP_KEY` | 建议 |
   | `CAIYUN_TOKEN` | 建议 |
   | `WAQI_TOKEN` | 可选（默认 `demo`） |

3. 部署。`/api/amap/*`、`/api/caiyun/*`、`/api/waqi/*` 由 Edge 函数处理。

### Cloudflare Pages

1. 连接仓库。Build：`npm run build`，Output：`dist`。
2. **Settings → Environment variables**（Production + Preview）：同上三个变量名。
3. 函数目录：[`functions/api/`](functions/api/)。  
   [`public/_routes.json`](public/_routes.json) 将 `/api/*` 交给 Functions。

可选：[`wrangler.toml`](wrangler.toml)。

## 原理

```
公网 IP → 城市（约）
       → 地理编码 / 高德 IP 矩形 → 粗 lat/lon
       → AQI / PM2.5（彩云 → WAQI → Open-Meteo，抢跑）
       → 根/时 ≈ 浓度 × 0.5 ÷ 8
       → 极净 · 单根 · 一簇 · 篝火
```

### 定位

- **仅城市级** — 不弹浏览器定位权限
- 优先国内 IP 线索（海外库常把国内 IPv6 标成北京）
- 绝不把缺失坐标写成 `0,0`（Null Island）
- 浏览器会 CORS 失败的源不从客户端请求

### 空气质量

- 多源并行抢跑，先到的有效读数胜出
- 若 `pm25=0` 但 `aqi>2`，0 视为缺测 → 用 AQI
- 界面可同时显示 PM2.5 与 AQI

### 火柴换算

体验向示意，**不是**实验室排放因子：

```
根/时 ≈ 浓度 × 0.5 ÷ 8
```

| 形态 | 大致阈值 |
|------|----------|
| 极净 | 浓度 ≤ 2（几乎不燃） |
| 单根 | 较低 |
| 一簇 | AQI ≥ 75 或 根/时 ≥ 3 |
| 篝火 | AQI ≥ 150 或 根/时 ≥ 8 |

### 交互

| 操作 | 行为 |
|------|------|
| **点燃** | 开始仪式（极净：轻触，不旺烧） |
| **点城市名** | 软刷新（有冷却，可强刷） |
| **分享** | 卡片预览 |
| **中 / EN** | 语言 |
| `Enter` / `Space` | 点燃 |
| `Ctrl/⌘ + L` | 切换语言 |

## 目录结构

```text
.
├── api/                     # Vercel Edge：/api/amap|caiyun|waqi/*
├── functions/api/           # Cloudflare Pages Functions
├── server/
│   └── proxy.mjs            # 共用：注入密钥 + 转发上游
├── deploy/
│   └── nginx.example.conf
├── public/
│   ├── 404.html
│   ├── _routes.json         # CF：仅 /api/* 走 Functions
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

### 共用模块

| 模块 | 用途 |
|------|------|
| `fireMode.js` | DOM 场景 + 分享卡布局常量 |
| `drawFire.js` | 分享卡等静态火候绘制 |
| `city.js` | 城市名本地化 |
| `aqi.js` | 计数、强度、极净判定 |

## 近期更新

- 篝火视觉：交错底柴 + 尖顶木架 + 多层火焰（非火柴堆）
- 分享卡重做构图，火候绘制抽成 `drawFire`
- 城市级 IP 定位，拒绝 `0,0` 假坐标
- 空气多源并行抢跑；假 `pm25=0` 回退 AQI
- 极净空气：药头余温 + 轻点燃
- 顶栏布局 / 点击热区 / 擦燃音效
- 自定义 `404.html` + nginx 示例

## 安全

- 密钥仅用 **非 `VITE_`** 环境变量名
- 客户端错误脱敏
- 生产构建：无 sourcemap、资源 hash、去掉 `console`
- `.env` 已 gitignore — 只提交 `.env.example`

## 技术栈

- Vue 3 + Vite 6
- Web Audio（仅擦燃）
- Canvas 分享卡
- Vitest

## 许可

MIT — 数据归属各提供方（高德 / 彩云 / WAQI / Open-Meteo / ipwho / ipip）。

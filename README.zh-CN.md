# 火柴 · Match

> 此刻空气，相当于多少根火柴在燃烧。

极简空气可视化：白底中央一根火柴。污染升高时变成一簇，再高则成篝火。

<p align="center">
  <img src="public/icon.svg" alt="火柴" width="96" />
</p>

**语言：** [English](README.md) · 中文

## 功能

- **点燃仪式** — 擦燃动效 + 短音效，数字 count-up，形态分步生长
- **污染形态** — 单根 / 一簇 / 篝火；极净几乎不燃
- **爆表** — 超过国标 PM2.5 封顶浓度时标注，不隐藏数字
- **失败 / 额度** — 读不到空气时阴燃；日 API 额度用尽则停止服务并提示
- **时间与历史** — 「更新于…」、同城 24h 对比（切语言会重译）
- **日夜与天气气质** — 只影响光感与烟火
- **分享卡片** — 竖版 / 方形；Canvas 与主场景共用火候绘制
- **中 / 英** — 城市名按界面语言逆地理解析，无手写大字典
- **PWA** — 离线壳 + 自定义 404
- **请求节流** — 缓存、冷却、去重、分级空气源
- **密钥不进前端** — Vite / Vercel / Cloudflare 注入 `/api/*`

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
| `npm run dev` | 开发服务 + API 代理 + CSRF/配额 |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览（带代理） |
| `npm test` | 单元测试 |
| `npm run lint` | ESLint |

## 配置

复制 [`.env.example`](.env.example) → `.env`。

| 变量 | 用途 | 进浏览器包？ |
|------|------|----------------|
| `AMAP_KEY` | 高德 IP + 地理编码 + 天气 | **否** |
| `QWEATHER_KEY` | 和风空气（**优先**） | **否** |
| `QWEATHER_HOST` | 可选 API Host | **否** |
| `CAIYUN_TOKEN` | 彩云备用 | **否** |
| `WAQI_TOKEN` | WAQI 备用（默认 `demo`） | **否** |
| `DAILY_API_LIMIT` | 每日上游 `/api` 次数（默认 `200`；`0` 不限制） | **否** |

> **不要用 `VITE_` 前缀写密钥。**

### 密钥注入

| 环境 | 方式 |
|------|------|
| 本地 | Vite 读 `.env` |
| Vercel | 环境变量 → [`api/[...path].js`](api/[...path].js) |
| Cloudflare | 环境变量 → [`functions/api/[[path]].js`](functions/api/[[path]].js) |
| Nginx | [`deploy/nginx.example.conf`](deploy/nginx.example.conf) |

共用：[`server/proxy.mjs`](server/proxy.mjs)、[`server/quota.mjs`](server/quota.mjs)。

### API 防护

1. **CSRF** — 必须 `X-Match-Client: 1`；有 Origin/Referer 时须同源  
2. **日配额** — `DAILY_API_LIMIT`，实现见 [`server/quota.mjs`](server/quota.mjs)（进程内 `Map`）  
   - **Serverless 注意：** Vercel Edge / Cloudflare 各 isolate 内存不共享，多实例并发时全站实际上限 ≈ `额度 × 活跃实例数`（best-effort 防刷）。  
   - 若要严格全局日限额，请改用 Cloudflare KV / Durable Objects、Vercel KV (Upstash) 或平台 Rate Limit。  
   - 超限 → `429` +「今日额度用尽」  
3. 不能替代平台级限流  

### 高德控制台

至少开通：**IP 定位**、**地理编码**、可选 **天气**。

### 和风

在 [dev.qweather.com](https://dev.qweather.com/) 创建 Key。  
仅当控制台提供专属 Host 时配置 `QWEATHER_HOST`。

## 部署

### Vercel

1. 导入仓库（Vite）  
2. Production + Preview 配置环境变量（含 `DAILY_API_LIMIT`）  
3. 部署；`/api/*` 由单一 Edge 函数处理  
4. 改 env 后 **Redeploy**

### Cloudflare Pages

1. Build：`npm run build`，Output：`dist`  
2. 同样环境变量  
3. [`functions/api/[[path]].js`](functions/api/[[path]].js) + [`public/_routes.json`](public/_routes.json)

## 原理

```
公网 IP → 城市（约）
       → 地理编码（可信城市名 → 坐标，不用错位 IP 点）
       → 展示名（逆地理语言 = 界面语言）
       → AQI / PM2.5：和风 → 彩云 → WAQI → Open-Meteo
       → 根/时 ≈ 浓度 × 0.5 ÷ 8
       → 强度 = 1 − exp(−c / 90)
       → 极净 · 单根 · 一簇 · 火堆 · 爆表
```

### 定位

- 仅城市级，不弹浏览器定位  
- 国内 IP 线索优先；海外库常把国内 IPv6 标成北京  
- 拒绝 `0,0`；有国内城市名则地理编码，不用错位坐标  

### 城市展示名

- 无大字典  
- 有坐标 → BigDataCloud 逆地理（`localityLanguage`）  
- 仅名字 → Open-Meteo 地理编码（`language`）  
- session 缓存  

### 空气质量

| 优先级 | 源 | 说明 |
|--------|-----|------|
| 1 | 和风 | 国标站点 / cn-mee |
| 2 | 彩云 | 优先 `aqi.chn` |
| 3 | WAQI | 尽量用 PM2.5 反算国标 |
| 4 | Open-Meteo | 模型兜底；总超时强制进入 |

另有约 6.5s 总超时；美标 AQI 漂移用 HJ 633 反算纠偏。

### 火柴换算

体验向，非实验室排放因子：

```
根/时 ≈ 浓度 × 0.5 ÷ 8
强度  = 1 − exp(−浓度 / 90)
```

| 形态 | 大致规则 |
|------|----------|
| 极净 | 浓度 ≤ 2 |
| 单根 | 较低 |
| 一簇 | 根/时 ≥ 3 或 AQI ≥ 75 |
| 火堆 | 根/时 ≥ 8 或 AQI ≥ 150 |
| 爆表 | 浓度 > 500 μg/m³ |

### 交互

| 操作 | 行为 |
|------|------|
| **点燃** | 仪式（极净：轻触） |
| **点城市** | 软刷新 |
| **分享** | 卡片 |
| **中 / EN** | 语言 + 重解析城市名 |
| `Enter` / `Space` | 点燃 |
| `Ctrl/⌘ + L` | 切换语言 |

## 目录

```text
.
├── api/[...path].js
├── functions/api/[[path]].js
├── server/proxy.mjs · quota.mjs
├── deploy/nginx.example.conf
├── public/
├── src/
│   ├── components · composables · services · utils · i18n · styles
├── .env.example
├── eslint.config.js
├── vercel.json · wrangler.toml
└── README.md · README.zh-CN.md
```

## 近期更新

- 和风优先；Vercel/CF 单一 catch-all `/api`（修复线上 404）
- 日 API 配额 + 爆表 / 额度用尽 UI
- 连续燃烧强度曲线 + `offScale`
- 城市名逆地理本地化（去掉字典表）
- CSRF 单一真源；上游与空气总超时
- MatchScene 样式外置；ESLint；系统字体（去掉 Google Fonts）
- 历史对比文案随语言重译

## 安全

- 仅非 `VITE_` 密钥  
- 客户端错误脱敏  
- 生产无 sourcemap、资源 hash、去掉 `console`  
- `.env` 不入库  

## 技术栈

Vue 3 · Vite 6 · Web Audio · Canvas · Vitest · ESLint  

## 许可

MIT — 数据归属各提供方（高德 / 和风 / 彩云 / WAQI / Open-Meteo / BigDataCloud / ipwho / ipip）。

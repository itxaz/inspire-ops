# OpenCRM 🚀

A full-featured open-source CRM built with React. Includes 15 modules:
**CRM · Sales · Invoicing · Inventory · Email Marketing · Documents · Database · Accounting · Project · Sign · Knowledge Base · eLearning · Social Marketing · WhatsApp Messaging · Dashboard**

---

## ⚡ Deploy the frontend to Netlify in 3 Steps

### Option A — Git-based (Easiest)
1. Push this repo to GitHub (see below)
2. Go to [netlify.com](https://netlify.com) → **Add new site → Import an existing project**
3. Pick the repo → Netlify reads `netlify.toml` (build `npm run build`, publish `dist`) → **Deploy**

`netlify.toml` already configures the SPA fallback and asset caching. Done! 🎉

---

### Option B — Netlify CLI
```bash
npm install -g netlify-cli
cd opencrm
npm install
netlify deploy --build --prod
```

> **Note — this deploys the frontend only.** The Inspire CRM API (`server/`) is a long-lived
> Node + Postgres service and is **not** hosted on Netlify (nor Vercel) — both are serverless/static
> platforms. Run the API on a container host (Railway / Render / Fly.io) with managed Postgres +
> Redis, and point the SPA at it via `VITE_API_URL` (CORS is enabled) or the `/api/*` proxy redirect
> in `netlify.toml`. See [`docs/inspire-crm-architecture.md`](docs/inspire-crm-architecture.md) for
> the deployment topology and rationale.

---

## 🐙 Push to GitHub

```bash
# Inside the opencrm folder:
git init
git add .
git commit -m "Initial commit: OpenCRM"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/opencrm.git
git branch -M main
git push -u origin main
```

---

## 💻 Run Locally

```bash
npm install
npm run dev
# Open http://localhost:5173
```

## 🏗️ Build for Production

```bash
npm run build
# Output in /dist — ready to upload anywhere
```

---

## 🗂️ Project Structure

```
opencrm/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx       # React entry point
│   └── App.jsx        # All 15 CRM modules
├── index.html
├── vite.config.js
├── vercel.json        # Vercel SPA routing config
└── package.json
```

---

## 🏛️ Architecture

See **[`docs/inspire-crm-architecture.md`](docs/inspire-crm-architecture.md)** for the Inspire CRM
technical blueprint — database schema, five-phase roadmap with base/premium tiers, data-flow
diagrams, and the scalability plan (custom Node + Postgres, shared DB with row-level security).

---

## 🔮 Next Steps (Adding a Real Backend)

To persist data across sessions, add:
- **[Supabase](https://supabase.com)** — Free PostgreSQL + Auth (recommended)
- **[PlanetScale](https://planetscale.com)** — MySQL-compatible serverless DB
- **[Railway](https://railway.app)** — Full Node.js + PostgreSQL backend (~$5/mo)

---

## 📄 License
MIT — Free to use, modify, and deploy commercially.

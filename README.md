# Mimir Media Search

Internal web application for The Standard media team to search, preview, and download assets stored in the **Mimir DAM (Digital Asset Management)** system — images, videos, and other media files.

---

## Background (ที่มาที่ไป)

The Standard stores all editorial media (photos, videos, raw footage) in a DAM platform called **Mimir**, hosted externally. Mimir provides a REST API but no convenient search interface for the newsroom team.

**Project Mimir** is an internal initiative to build a fast, accessible search layer on top of the Mimir API so that editors, photographers, and video producers can:

- Find assets by keyword, person name, description, or transcript
- Filter by media type, date range, duration, and location
- Preview images and videos directly in the browser
- Download Hi-res or Lo-res versions without needing VPN or DAM credentials

The project started on **1 April 2026** as a test deployment. As of v2.1, it is used by the full editorial team and restricted to `@thestandard.co` Google Workspace accounts.

---

## Features

| Feature | Description |
|---------|-------------|
| **Google OAuth Login** | Sign in with `@thestandard.co` Google Workspace — no separate password |
| **Full-text search** | Search across title, people, description, transcript, labels, metadata, file name, and detected text |
| **Advanced filters** | Date range, video duration, ingest location, sort order, page size |
| **Media type chips** | Quick filter: All / Images / Videos — YouTube-style chips bar |
| **Thumbnail grid** | Masonry layout, correct aspect ratios — no cropping |
| **Asset modal** | Inline video player + full-size image preview + download buttons |
| **Recent folders** | Landing page shows folders with new assets in the last 7 days |
| **Scroll API** | Bypasses Elasticsearch 10,000-item cap — searches across 300,000+ assets |
| **Dark / Light mode** | Persisted in localStorage, no flash on load |
| **Admin Console** | 4-tab dashboard: Overview, User Management, Activity Logs, Git Commits |
| **JWT Auth** | Stateless JWT cookie (2h TTL) alongside session auth — survives server restart |
| **Activity logging** | Every login, search, view, and download is logged to `data/activity.log` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | Express.js 4 |
| Views | EJS templating |
| Authentication | Passport.js + Google OAuth 2.0, JWT (HS256, httpOnly cookie) |
| DAM API auth | AWS Cognito SRP via `amazon-cognito-identity-js` |
| Security | Helmet.js (CSP, HSTS, X-Frame-Options), express-rate-limit |
| Session store | express-session + memorystore |
| HTTP client | Axios |
| Data persistence | File-based JSONL (`data/activity.log`) + JSON (`data/users.json`) |
| Deployment | Railway.app (auto-deploy from GitHub main branch) |
| Volume | Railway Volume mounted at `/app/data` — persists logs and user data across redeploys |

---

## Project Structure

```
mimir-websearch/
├── app.js                    # Express app entry point, middleware setup
├── routes/
│   └── index.js              # All route definitions
├── controllers/
│   ├── searchController.js   # Search logic, Mimir API calls, pagination
│   ├── adminController.js    # Admin dashboard, user CRUD
│   ├── changelogController.js# Changelog page + JSON API
│   └── authController.js     # Login page, logout handler
├── models/
│   ├── mimirModel.js         # Mimir API integration (Cognito auth + search)
│   ├── userModel.js          # User registry (data/users.json)
│   └── logModel.js           # Activity log read/write (data/activity.log)
├── services/
│   ├── mimirAuth.js          # Cognito SRP token refresh logic
│   └── githubService.js      # Fetch recent commits from GitHub API
├── middleware/
│   ├── auth.js               # requireAuth — checks JWT then falls back to session
│   └── jwt.js                # JWT sign, verify, cookie set/clear
├── views/
│   ├── index.ejs             # Main search page
│   ├── admin.ejs             # Admin console (4 tabs)
│   ├── login.ejs             # Login page
│   ├── changelog.ejs         # Changelog page
│   └── partials/
│       ├── header.ejs        # Navigation, dark mode toggle, user avatar
│       └── footer.ejs
├── public/
│   ├── css/style.css         # All styles (CSS custom properties for theming)
│   └── js/                   # Client-side JS (search, modal, sidebar)
├── data/                     # ← mounted as Railway Volume
│   ├── activity.log          # JSONL activity log (append-only)
│   └── users.json            # Registered user list with roles/permissions
├── changelog.json            # Version history (at project root, not in Volume)
├── Dockerfile                # Container definition
├── railway.toml              # Railway deployment config
└── .env.example              # Required environment variables
```

---

## Authentication Flow

```
User → Google OAuth → domain check (hd === 'thestandard.co')
     → auto-register in data/users.json (first login)
     → check status: suspended? → redirect /login?error=suspended
     → set JWT cookie (2h TTL) + express session (8h)
     → all routes require requireAuth middleware
```

JWT takes priority over session — the app works after server restart without re-login as long as the cookie is valid.

---

## Admin Console

Available at `/admin` — restricted to emails listed in `ADMIN_EMAILS` env var.

| Tab | What you can do |
|-----|----------------|
| **ภาพรวม** | Stats cards, top search queries, most active users |
| **ผู้ใช้งาน** | Add/edit/remove users, set Role (admin/user), toggle search & download permissions, suspend accounts |
| **กิจกรรม** | Full activity log, filter by user, view per-user download history |
| **Git Commits** | Live commit history pulled from GitHub API |

---

## Environment Variables

Create a `.env` file (see `.env.example`):

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

# Session + JWT
SESSION_SECRET=your-random-secret
JWT_SECRET=your-jwt-secret

# Mimir DAM API
MIMIR_API_URL=
MIMIR_COGNITO_CLIENT_ID=
MIMIR_USERNAME=
MIMIR_PASSWORD=

# Admin access (comma-separated emails)
ADMIN_EMAILS=you@thestandard.co

# GitHub API (for commit history in admin)
GITHUB_TOKEN=
GITHUB_REPO=org/repo-name

NODE_ENV=production
PORT=3000
```

---

## Running Locally

```bash
npm install
cp .env.example .env   # fill in your values
npm run dev            # nodemon — auto-restarts on file changes
```

Open `http://localhost:3000`

---

## Deployment (Railway)

1. Push to `main` branch → Railway auto-deploys
2. Add a **Volume** mounted at `/app/data` to persist logs and user data across redeploys
3. Set all env vars in Railway → Variables tab

The `railway.toml` and `Dockerfile` are included for custom build configuration.

---

## Version History

See [CHANGELOG](changelog.json) or visit `/changelog` in the app.

| Version | Date | Highlight |
|---------|------|-----------|
| 2.1.0 | 2026-04-07 | Admin Console with user management & activity logs |
| 2.0.0 | 2026-04-07 | YouTube-style UI, chips bar, recent folders landing page |
| 1.9.0 | 2026-04-06 | Security hardening (Helmet, rate limiting, input validation) |
| 1.8.0 | 2026-04-05 | Google OAuth login + JWT + activity logging |
| 1.7.0 | 2026-04-05 | Admin dashboard, hamburger sidebar, changelog panel |
| 1.6.0 | 2026-04-04 | Rebrand to The Standard, Railway deployment |
| 1.5.0 | 2026-04-04 | Dark mode, masonry thumbnail grid |
| 1.4.0 | 2026-04-03 | Advanced search filters |
| 1.3.0 | 2026-04-03 | Scroll API — break 10,000-item Elasticsearch cap |
| 1.0.0 | 2026-04-01 | Initial release |

---

*Internal tool — The Standard. Not for public distribution.*

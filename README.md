# Mimir Media Search

เว็บแอปพลิเคชันสำหรับทีมสื่อของ The Standard ใช้ค้นหา ดูตัวอย่าง และดาวน์โหลดสื่อจากระบบ **Mimir DAM (Digital Asset Management)** ได้แก่ รูปภาพ วีดิโอ และไฟล์สื่ออื่น ๆ

---

## ที่มาที่ไป

The Standard เก็บสื่อกองบรรณาธิการทั้งหมด (ภาพข่าว, วีดิโอ, footage) ไว้บนแพลตฟอร์ม DAM ชื่อ **Mimir** ซึ่งเชื่อมต่อผ่าน REST API แต่ไม่มี UI ค้นหาที่สะดวกสำหรับทีมในห้องข่าว

**Project Mimir** จึงเกิดขึ้นเพื่อสร้าง search layer บน API ดังกล่าว ให้บรรณาธิการ ช่างภาพ และทีมวีดิโอสามารถ:

- ค้นหาสื่อด้วยคำสำคัญ ชื่อบุคคล คำบรรยาย หรือ transcript
- กรองตามประเภทสื่อ ช่วงวันที่ ความยาววีดิโอ และสถานที่
- ดูตัวอย่างรูปและวีดิโอได้ในเบราว์เซอร์ทันที
- ดาวน์โหลด Hi-res หรือ Lo-res โดยไม่ต้องใช้ VPN หรือ credentials ของ DAM

เริ่มทดสอบตั้งแต่วันที่ **1 เมษายน 2569** ตั้งแต่ v2.1 เป็นต้นมาจำกัดการใช้งานเฉพาะบัญชี Google Workspace `@thestandard.co`

---

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---------|-----------|
| **Google OAuth Login** | เข้าสู่ระบบด้วย `@thestandard.co` — ไม่ต้องตั้งรหัสผ่านแยก |
| **ค้นหาเต็มรูปแบบ** | ค้นจาก title, ชื่อบุคคล, description, transcript, labels, metadata, ชื่อไฟล์ และ detected text |
| **Advanced Search** | กรองช่วงวันที่, ความยาววีดิโอ, สถานที่, การเรียงลำดับ, จำนวนผลต่อหน้า |
| **Chips bar** | กรองด่วน: ทั้งหมด / รูปภาพ / วีดิโอ แบบ YouTube |
| **Thumbnail grid** | Grid เท่ากันทุกใบ อัตราส่วน 16:10, crop อัตโนมัติ |
| **Asset modal** | video player ในหน้า + ดูรูปขนาดเต็ม + ปุ่มดาวน์โหลด |
| **Recent folders** | Landing page แสดงโฟลเดอร์ที่มีสื่อใหม่ใน 7 วัน |
| **Scroll API** | เลี่ยง cap 10,000 รายการของ Elasticsearch — ค้นได้ถึง 300,000+ รายการ |
| **Dark / Light mode** | จำธีมไว้ใน localStorage ไม่ flash ขาวตอนโหลด |
| **Admin Console** | Dashboard 4 แท็บ: ภาพรวม / ผู้ใช้งาน / กิจกรรม / Git Commits |
| **JWT Auth** | JWT cookie (2 ชม.) ต่อคู่กับ session — ไม่ต้อง login ใหม่หลัง server restart |
| **บันทึกกิจกรรม** | ทุก login, search, ดู asset, และดาวน์โหลด ถูกบันทึกเป็น JSONL |

---

## Tech Stack

| Layer | เทคโนโลยี |
|-------|----------|
| Runtime | Node.js 20 |
| Framework | Express.js 4 |
| Views | EJS templating |
| Authentication | Passport.js + Google OAuth 2.0, JWT (HS256, httpOnly cookie) |
| DAM API auth | AWS Cognito SRP ผ่าน `amazon-cognito-identity-js` |
| Security | Helmet.js (CSP, HSTS, X-Frame-Options), express-rate-limit |
| Session store | express-session + memorystore |
| HTTP client | Axios |
| ข้อมูล persistent | JSONL (`data/activity.log`) + JSON (`data/users.json`) |
| Deployment | Railway.app (auto-deploy จาก GitHub branch main) |
| Volume | Railway Volume mount ที่ `/app/data` — ข้อมูลคงอยู่ข้ามการ redeploy |
| Container | Docker + docker-compose |

---

## โครงสร้างโปรเจค

```
mimir-websearch/
│
├── app.js                      # จุดเริ่มต้นของแอป, ตั้งค่า middleware ทั้งหมด
│
├── routes/
│   └── index.js                # ลงทะเบียน route ทุกเส้น
│
├── controllers/
│   ├── searchController.js     # logic ค้นหา, เรียก Mimir API, pagination
│   ├── adminController.js      # Admin dashboard, CRUD user
│   ├── changelogController.js  # หน้า Changelog + JSON API
│   └── authController.js       # หน้า Login, logout handler
│
├── models/
│   ├── mimirModel.js           # เชื่อมต่อ Mimir API (Cognito auth + search)
│   ├── userModel.js            # ทะเบียนผู้ใช้ (data/users.json)
│   └── logModel.js             # อ่าน/เขียน activity log (data/activity.log)
│
├── services/
│   ├── mimirAuth.js            # Cognito SRP token refresh
│   └── githubService.js        # ดึง commit history จาก GitHub API
│
├── middleware/
│   ├── auth.js                 # requireAuth — ตรวจ JWT ก่อน ถ้าไม่มีค่อยตรวจ session
│   └── jwt.js                  # sign, verify, set/clear cookie
│
├── views/
│   ├── index.ejs               # หน้าค้นหาหลัก
│   ├── admin.ejs               # Admin console (4 แท็บ)
│   ├── login.ejs               # หน้า Login
│   ├── changelog.ejs           # หน้า Changelog
│   └── partials/
│       ├── header.ejs          # Nav bar, dark mode toggle, avatar
│       └── footer.ejs
│
├── public/
│   ├── css/style.css           # ทุก style (ใช้ CSS custom properties สำหรับ theme)
│   └── js/                     # Client-side JS (search, modal, sidebar)
│
├── data/                       # ← mount เป็น Railway Volume / Docker volume
│   ├── activity.log            # JSONL บันทึกกิจกรรม (append-only)
│   └── users.json              # รายชื่อผู้ใช้พร้อม role และสิทธิ์
│
├── changelog.json              # ประวัติ version (อยู่ root ไม่อยู่ใน Volume)
├── Dockerfile                  # สร้าง production image (multi-stage, non-root user)
├── docker-compose.yml          # รัน container พร้อม volume และ env
├── railway.toml                # config สำหรับ Railway.app
└── .env.example                # รายการ environment variables ที่ต้องตั้งค่า
```

---

## การ Authentication

```
ผู้ใช้ → Google OAuth → ตรวจ domain (hd === 'thestandard.co')
       → auto-register ลง data/users.json (login ครั้งแรก)
       → ตรวจ status: suspended? → redirect /login?error=suspended
       → ตั้งค่า JWT cookie (2 ชม.) + express session (8 ชม.)
       → ทุก route ต้องผ่าน requireAuth middleware
```

JWT มีลำดับความสำคัญก่อน session — แอปทำงานต่อได้หลัง server restart ตราบใดที่ cookie ยังไม่หมดอายุ

---

## Admin Console

เข้าได้ที่ `/admin` — จำกัดเฉพาะอีเมลที่ตั้งใน env var `ADMIN_EMAILS`

| แท็บ | สิ่งที่ทำได้ |
|-----|------------|
| **ภาพรวม** | Stats cards, คำค้นหายอดนิยม, ผู้ใช้ที่ active มากที่สุด |
| **ผู้ใช้งาน** | เพิ่ม/แก้ไข/ลบ user, ตั้ง Role (admin/user), เปิดปิดสิทธิ์ค้นหา/ดาวน์โหลด, ระงับบัญชี |
| **กิจกรรม** | Activity log ทั้งหมด, กรองตาม user, ดูประวัติดาวน์โหลดรายคน |
| **Git Commits** | ประวัติ commit ล่าสุดจาก GitHub API |

---

## Environment Variables

สร้างไฟล์ `.env` (ดูตัวอย่างจาก `.env.example`):

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback

# Session + JWT
SESSION_SECRET=random-string-ยาว ๆ
JWT_SECRET=random-string-ยาว ๆ

# Mimir DAM API
MIMIR_API_URL=
MIMIR_COGNITO_CLIENT_ID=
MIMIR_USERNAME=
MIMIR_PASSWORD=

# Admin (คั่นด้วย comma)
ADMIN_EMAILS=you@thestandard.co

# GitHub API (สำหรับ commit history ใน admin)
GITHUB_TOKEN=
GITHUB_REPO=org/repo-name

NODE_ENV=production
PORT=3000
```

---

## รันในเครื่อง (Local)

```bash
npm install
cp .env.example .env   # แก้ไขค่าให้ครบ
npm run dev            # nodemon — restart อัตโนมัติเมื่อแก้ไขไฟล์
```

เปิด `http://localhost:3000`

---

## Deploy ด้วย Docker

```bash
cp .env.example .env   # แก้ไขค่าให้ครบ
docker compose up -d   # build และรัน container
```

หรือถ้าใช้ Portainer / Docker stack โดยไม่มีไฟล์ `.env` ให้ตั้ง environment variables ใน UI ของ Portainer แทน (docker-compose.yml รองรับทั้งสองแบบ)

Volume `./data:/app/data` จะเก็บ `activity.log` และ `users.json` ไว้นอก container

---

## Deploy บน Railway

1. Push ไปที่ branch `main` → Railway auto-deploy
2. เพิ่ม **Volume** mount ที่ `/app/data` เพื่อให้ข้อมูลคงอยู่ข้าม redeploy
3. ตั้ง env vars ทั้งหมดใน Railway → แท็บ Variables

---

## ประวัติ Version

ดูรายละเอียดที่ [changelog.json](changelog.json) หรือเปิด `/changelog` ในแอป

| Version | วันที่ | สิ่งที่เปลี่ยน |
|---------|--------|--------------|
| 2.1.0 | 7 เม.ย. 69 | Admin Console: จัดการ user + Activity logs |
| 2.0.0 | 7 เม.ย. 69 | UI แบบ YouTube, chips bar, landing page recent folders |
| 1.9.0 | 6 เม.ย. 69 | Security hardening (Helmet, rate limiting, input validation) |
| 1.8.0 | 5 เม.ย. 69 | Google OAuth login + JWT + activity logging |
| 1.7.0 | 5 เม.ย. 69 | Admin dashboard, hamburger sidebar, changelog panel |
| 1.6.0 | 4 เม.ย. 69 | Rebrand The Standard, deploy Railway |
| 1.5.0 | 4 เม.ย. 69 | Dark mode, masonry thumbnail grid |
| 1.4.0 | 3 เม.ย. 69 | Advanced search filters |
| 1.3.0 | 3 เม.ย. 69 | Scroll API — ทะลุ cap 10,000 รายการ |
| 1.0.0 | 1 เม.ย. 69 | เปิดตัว |

---

*เครื่องมือใช้ภายใน — The Standard ห้ามเผยแพร่สู่สาธารณะ*

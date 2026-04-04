# TSD Media Search — สรุปการพัฒนาโครงการ

> **ชื่อโครงการ:** TSD Media Search (เดิม: Mimir Media Search)  
> **วัตถุประสงค์:** Internal tool สำหรับพนักงาน The Standard ค้นหาและดูสื่อใน Mimir DAM โดยไม่ต้องมีบัญชี Mimir  
> **URL (Production):** https://tsd-media-search-production.up.railway.app  
> **Source code:** https://github.com/narasitk77/tsd-media-search  

---

## โจทย์ที่ได้รับ

ระบบ Mimir DAM มีสื่อกว่า **346,000+ รายการ** แต่พนักงานที่ไม่มีบัญชี Mimir ไม่สามารถเข้าถึงได้เลย จึงต้องสร้างเว็บ Internal ที่:
- ใช้งานได้โดยไม่ต้องมีบัญชี Mimir
- ค้นหาสื่อได้ครบ ไม่ถูกจำกัดแค่ 10,000 รายการ
- มีระบบ Login ด้วย Google (@thestandard.co) เพื่อความปลอดภัย
- เก็บบันทึกว่าใครค้นหาหรือดาวน์โหลดอะไร

---

## สถาปัตยกรรมระบบ

```
Browser (User)
    │
    ▼
Express.js Server (Node.js)
    │
    ├── Google OAuth 2.0 ──► ตรวจสอบ @thestandard.co
    │
    ├── Passport.js ──► Session management (8 ชั่วโมง)
    │
    ├── Mimir API (apac.mjoll.no)
    │       └── Cognito SRP Auth ──► JWT Token ──► API calls
    │
    └── Activity Logger ──► บันทึก search/view/download
```

**Stack:**
| ส่วน | เทคโนโลยี |
|------|-----------|
| Backend | Node.js + Express.js |
| Template | EJS (Server-side rendering) |
| Auth (Mimir) | Amazon Cognito SRP (amazon-cognito-identity-js) |
| Auth (User) | Google OAuth 2.0 + Passport.js |
| Session | express-session + memorystore |
| Security | Helmet.js + express-rate-limit |
| Logging | File-based (JSONL) |
| Deploy | Railway (GitHub auto-deploy) |

---

## ประวัติการพัฒนา (9 เวอร์ชัน)

### v1.0.0 — รากฐานของระบบ
**โจทย์:** สร้างเว็บ Internal เชื่อมต่อ Mimir API

**สิ่งที่ทำ:**
- สร้างโครงสร้าง MVC (Model / Controller / View)
- เชื่อมต่อ Mimir API ด้วย **Cognito SRP Authentication** — วิธีนี้ทำให้ server login เข้า Mimir แทนผู้ใช้ และแนบ JWT token ทุก request โดยที่ผู้ใช้ไม่ต้องมีบัญชี
- หน้าค้นหาหลัก แสดงผลเป็น grid card พร้อม thumbnail

---

### v1.1.0 — แก้ไข API Parameters
**ปัญหา:** ค้นหาไม่มีผลลัพธ์ / thumbnail ไม่โหลด / auth ล้มเหลว

**สิ่งที่ค้นพบและแก้:**
- `query=` → ต้องใช้ `searchString=` (Mimir กำหนดไว้)
- `size=` → ต้องใช้ `itemsPerPage=`
- Auth header ต้องเป็น `x-mimir-cognito-id-token: {token}` ไม่ใช่ `Bearer {token}`
- Thumbnail URL หมดอายุเร็ว — สร้าง **Proxy Route** (`/proxy/thumbnail/:id`) ดึง presigned S3 URL ใหม่ทุกครั้ง
- เพิ่ม Modal ดูสื่อ + ปุ่มดาวน์โหลด Hi-Res

---

### v1.2.0 — แก้ผลลัพธ์ถูก Folder ครอบงำ
**ปัญหา:** ผลลัพธ์ส่วนใหญ่เป็น folder/timeline ไม่ใช่สื่อจริง

**สาเหตุ:** Mimir API คืน asset ทุกประเภทรวมกัน ทั้ง folder, timeline, image, video

**การแก้:**
- ดึงข้อมูลแบบ batch ทีละ 500 รายการ
- กรองเฉพาะ `mediaType: image | video` ออกมา
- ตั้ง `MAX_SCAN = 5,000` เพื่อข้ามผ่าน folder ให้ครบ
- เพิ่ม filter tab (ทั้งหมด / รูปภาพ / วีดิโอ) + badge แสดงจำนวน

---

### v1.3.0 — ทะลุข้อจำกัด 10,000 รายการ
**ปัญหา:** Mimir API จำกัดผลลัพธ์สูงสุด 10,000 รายการ ทั้งที่คลังมี 347,081 รายการ

**การสืบสวน:** วิเคราะห์ JavaScript bundle ของ Mimir เองพบว่าระบบใช้ Elasticsearch ซึ่งมี `max_result_window = 10,000` (hard limit)

**การค้นพบ:** Mimir มี **Scroll API** ซ่อนอยู่ — ใช้ `scroll=true` แทน offset pagination จะได้ `mScrollId` cursor ที่ไม่มีขีดจำกัด

**การแก้:**
- เปลี่ยน Browse mode ใช้ Scroll API → เข้าถึงได้ครบ **347,081 รายการ**
- สร้าง Scroll Cache (5 นาที) เพื่อไม่ดึงซ้ำเมื่อ page เดิม
- Keyword search ยังใช้ regular endpoint (ได้ metadata ครบกว่า)

---

### v1.4.0 — Advanced Search แบบ Mimir
**โจทย์:** เพิ่มตัวกรองขั้นสูงให้เหมือน Mimir UI จริง

**สิ่งที่ค้นพบ:** หลังทดสอบอย่างละเอียด Mimir API **รองรับแค่ `searchString=` เดียว** — parameter อื่นทั้งหมด (`title=`, `people=` ฯลฯ) ถูก ignore ทั้งหมด วิธีที่ Mimir UI ทำจริงคือรวมทุก field เข้าเป็น searchString เดียวก่อนส่ง

**สิ่งที่สร้าง:**
- Advanced Search panel (เปิด/ปิดได้) มี 8 field: Titles, People, Descriptions, Transcripts, Labels, Metadata, File, Detected text
- Date range filter (สร้างสื่อ from–to)
- Duration filter (min–max วินาที) — กรอง client-side จาก `technicalMetadata`
- Ingest Location filter — กรอง client-side จาก path
- Sort by date/title + ascending/descending
- Active filter tags แสดงตัวกรองที่ใช้งานอยู่
- ปุ่มล้างตัวกรองทั้งหมด

---

### v1.5.0 — Change Logs Tab
**โจทย์:** ต้องการบันทึกประวัติทุกการเปลี่ยนแปลงโดยไม่ต้องแจ้งทุกครั้ง

**สิ่งที่สร้าง:**
- Tab "Change Logs" ในเมนูบนสุด
- `data/changelog.json` เก็บประวัติทุกเวอร์ชัน
- หน้า timeline แสดง version badge, วันที่, ป้าย Added/Fixed/Improved
- ป้าย "ล่าสุด" บนเวอร์ชันล่าสุดเสมอ
- **ระบบอัปเดตอัตโนมัติ** — ทุกครั้งที่มีการเปลี่ยนแปลง changelog จะถูกอัปเดตโดยไม่ต้องบอก

---

### v1.6.0 — Dark Mode + Masonry Thumbnail
**โจทย์:** เพิ่ม Dark Mode และแก้ thumbnail ที่ crop ภาพแนวตั้ง

**Dark Mode:**
- ปุ่มสลับ (ไอคอนพระจันทร์/ดวงอาทิตย์) บน header
- CSS custom properties ทั้งหมดเปลี่ยนผ่าน `[data-theme="dark"]`
- บันทึกค่าใน `localStorage` — โหลดหน้าใหม่ไม่ flash ขาว (anti-flash script ใน `<head>`)

**Masonry Thumbnail:**
- เปลี่ยนจาก fixed `aspect-ratio: 16/10` + `object-fit: cover` → CSS Masonry columns
- ภาพแนวตั้งแสดงแนวตั้ง ภาพแนวนอนแสดงแนวนอน ตามสัดส่วนจริง

---

### v1.7.0 — รีแบรนด์ The Standard
**โจทย์:** เปลี่ยนเป็น The Standard branding

**สิ่งที่เปลี่ยน:**
- โลโก้ SVG เดิม → PNG โลโก้ The Standard จริง
- ชื่อ "Mimir Media Search" → "Media Search"
- Header bar สีขาวตายตัว (ทั้ง light/dark mode) พร้อม nav links สีดำ

---

### v1.8.0 — Google OAuth Login + Activity Logging
**โจทย์:** เพิ่ม Login ด้วย Google Workspace + เก็บ log การใช้งาน

**Google OAuth:**
- ใช้ `passport-google-oauth20` + GCP Console (ฟรี, ไม่ต้องเปิด billing)
- ตรวจสอบ `hd === 'thestandard.co'` **ฝั่ง server** เท่านั้น (client ปลอมแปลงได้)
- Session 8 ชั่วโมง — หมดแล้ว login ใหม่อัตโนมัติ
- แสดงรูปโปรไฟล์ + ชื่อ + ปุ่มออกจากระบบบน header
- ทุก route redirect ไป `/login` ถ้ายังไม่ได้ login

**Activity Logging (data/activity.log):**
| Event | ข้อมูลที่เก็บ |
|-------|--------------|
| login | email, ชื่อ, เวลา |
| logout | email, เวลา |
| search | email, query, ทุก filter, จำนวนผลลัพธ์ |
| view | email, asset ID, ชื่อ, ประเภท |
| download | email, asset ID, ชื่อ, ประเภท |

---

### v1.9.0 — Security Hardening
**โจทย์:** ตรวจสอบความปลอดภัยก่อน deploy จริง

**Security audit พบ 25 issues — แก้ทันที:**

| สิ่งที่แก้ | วิธี |
|-----------|------|
| ไม่มี HTTP security headers | Helmet.js (CSP, X-Frame-Options, HSTS) |
| ไม่มี rate limiting | 60 req/min (search), 20/15min (auth) |
| ไม่ validate input ID | Regex `^[a-zA-Z0-9_-]{1,100}$` ทุก route |
| Session cookie ไม่ปลอดภัย | httpOnly, secure (production), sameSite=lax |
| Payload flooding | จำกัด body 100kb |
| Hardcoded credentials | ลบออกจาก config ทั้งหมด |
| Stack trace รั่วไปหา client | Error handler ซ่อน detail |
| Log injection | Sanitize ข้อมูล log ก่อนบันทึก |

---

## โครงสร้างไฟล์

```
tsd-media-search/
├── app.js                    # Entry point, middleware, security setup
├── routes/index.js           # Route definitions + auth protection
├── middleware/auth.js        # requireAuth middleware
├── controllers/
│   ├── searchController.js   # ค้นหา, thumbnail proxy, asset detail
│   ├── changelogController.js# หน้า changelog
│   └── authController.js     # Login/logout pages
├── models/
│   ├── mimirModel.js         # Mimir API calls, scroll cache, filters (410 lines)
│   └── logModel.js           # Activity logging (file-based)
├── services/
│   └── mimirAuth.js          # Cognito SRP token management
├── config/
│   └── mimir.js              # API configuration
├── views/
│   ├── index.ejs             # หน้าหลัก + advanced search (406 lines)
│   ├── login.ejs             # หน้า login
│   ├── changelog.ejs         # หน้า changelog timeline
│   └── partials/
│       ├── header.ejs        # Header + nav + user info + theme toggle
│       └── footer.ejs        # Footer
├── public/
│   ├── css/style.css         # Styles รวม dark mode (1,020 lines)
│   ├── js/main.js            # Frontend JS (223 lines)
│   └── images/
│       └── the-standard-logo.png
├── data/
│   ├── changelog.json        # ประวัติการอัปเดต
│   └── activity.log          # บันทึกการใช้งาน (JSONL format)
├── .env                      # Credentials (ไม่ commit)
├── .env.example              # Template สำหรับ setup ใหม่
└── .gitignore
```

---

## สถิติโค้ด

| ไฟล์ | จำนวนบรรทัด |
|------|-------------|
| public/css/style.css | 1,020 |
| models/mimirModel.js | 410 |
| views/index.ejs | 406 |
| public/js/main.js | 223 |
| app.js | ~130 |
| **รวมทั้งหมด** | **~2,500+** |

---

## Environment Variables ที่ต้องใช้

```
MIMIR_BASE_URL                    # Mimir API endpoint
MIMIR_COGNITO_USER_POOL_ID        # AWS Cognito Pool ID
MIMIR_COGNITO_CLIENT_ID           # AWS Cognito Client ID
MIMIR_COGNITO_OIDC_TOKEN_ENDPOINT # Cognito token endpoint
MIMIR_USERNAME                    # Service account email
MIMIR_PASSWORD                    # Service account password
GOOGLE_CLIENT_ID                  # จาก GCP Console
GOOGLE_CLIENT_SECRET              # จาก GCP Console
GOOGLE_CALLBACK_URL               # https://{domain}/auth/google/callback
SESSION_SECRET                    # Random string ยาวๆ
NODE_ENV                          # production
```

---

## ข้อจำกัดที่รู้อยู่แล้ว

| ข้อจำกัด | สาเหตุ | วิธีแก้ถ้าต้องการ |
|---------|--------|-----------------|
| Session หายเมื่อ Railway restart | ใช้ memory store | เพิ่ม Railway Volume |
| Activity log หายเมื่อ redeploy | ไฟล์บน Railway ephemeral filesystem | เพิ่ม Railway Volume |
| Field-specific search ไม่ได้แยกจริง | Mimir API รองรับแค่ `searchString=` เดียว | ไม่มีทางแก้ได้จากฝั่งเรา |
| Duration/Location filter ช้า | กรอง client-side หลังดึงข้อมูล | ยอมรับได้สำหรับ internal use |

---

## ขั้นตอน Deploy ครั้งต่อไป (ถ้าต้องตั้งใหม่)

1. Clone: `git clone https://github.com/narasitk77/tsd-media-search.git`
2. ติดตั้ง: `npm install`
3. Copy `.env.example` → `.env` แล้วใส่ค่าจริง
4. รัน local: `npm start`
5. Push → Railway auto-deploy ทันที

---

*เอกสารนี้ครอบคลุมการพัฒนาทั้งหมดตั้งแต่ต้นจนถึง v1.9.0 (2026-04-04)*

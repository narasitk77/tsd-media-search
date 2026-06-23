# แผน Migration: Mimir/Wasabi → Google Drive

> **บริบท:** Mimir DAM กำลังจะหมดสัญญา → ต้องแทนที่เต็มตัว (ไม่มี fallback) และรวมคลังสื่อเข้า Google Workspace
> **ของที่มี:** 347,081 รายการใน Mimir · เว็บ TSD Media Search (Node) · AI Metadata Tool (Postgres + Qdrant + Gemini)
> **เป้าหมาย:** เว็บเดิมทำงานต่อได้ โดยเปลี่ยน backend จาก Mimir → Google Drive

---

## 📊 ผลสำรวจจริง (วัดจาก Mimir แล้ว — 2026-06-23)

ดึงจาก Mimir scroll API + สุ่มวัดขนาด 4,000 ชิ้น (`migration/export-mimir.js`)

| | จำนวน | ขนาดเฉลี่ย/ชิ้น | **ขนาดรวม (ประเมิน)** |
|---|---:|---:|---:|
| 🎬 **วิดีโอ** | 22,766 | ~520 MB | **~11.85 TB** ← กิน 83% |
| 🖼️ รูปภาพ | 349,795 | ~6.7 MB | ~2.35 TB |
| 🔊 เสียง | 644 | ~44 MB | ~29 GB |
| 📄 ไฟล์อื่น | 331 | เล็ก | < 1 GB |
| (timeline/cliplist/person — Mimir internal, ไม่ใช่ไฟล์) | 204 | — | — |
| **รวม** | **373,740** | | **≈ 14 TB** |

**สิ่งที่ต้องตัดสินใจจากตัวเลขนี้:**
- 🔑 **ต้องการพื้นที่ Google Workspace ~14 TB** (pooled storage) — เช็คกับ Workspace admin ว่าแพ็กเกจ + จำนวน user รองรับไหม (เช่น Business Plus = 5TB/user pooled) **นี่คือ blocker ที่ต้องเคลียร์ก่อน**
- วิดีโอคือต้นทุนหลัก — ถ้าพื้นที่ไม่พอ พิจารณา archive วิดีโอเก่า/บีบอัด proxy แทนต้นฉบับ
- Download URL ต้นฉบับมีครบ (3,992/4,000) → ดึงไฟล์จริงได้
- ⚠️ **Transcript เจอน้อยมากในตัวอย่าง (1/4,000)** — รอผล export เต็มยืนยัน (อาจมีเฉพาะวิดีโอที่เปิด transcription)

> ตัวเลขละเอียดอยู่ใน `migration/out/inventory-report.json` (gitignore) · ผล export เต็มกำลังรัน

---

## หลักการสำคัญ (อ่านก่อน)

**Google Drive = "ที่เก็บไฟล์" เท่านั้น — ห้ามใช้เป็น search engine**

Drive API ค้นหาอ่อน + โดน quota จำกัด ยิงค้นสด 347k ไม่ไหว ดังนั้น:

```
Google Drive (Shared Drive)  ←─ เก็บไฟล์จริง (วิดีโอ/รูป)
        │  Changes API (ดูดไฟล์ใหม่/แก้ไข แบบ incremental)
        ▼
AI Metadata Tool  ←─ "สมองค้นหา" ของเรา (โปรดักชันจริง ไม่ใช่ของเสริมอีกต่อไป)
   ├─ Postgres : metadata ค้นได้ (canonical)
   ├─ Qdrant   : vector semantic search
   └─ Gemini   : gen คำบรรยาย/คีย์เวิร์ด/ถอดเทป
        ▼
TSD Media Search (เว็บเดิม) → ค้นจาก index เรา · ดึง thumbnail/วิดีโอจาก Drive
```

ผลคือ **AI Metadata Tool กลายเป็นหัวใจระบบ** (ทำไปแล้ว ~80%) — เว็บ frontend ใช้ของเดิมได้เลย เปลี่ยนแค่ data layer

---

## ⏰ สิ่งที่ต้องทำด่วนที่สุด (ก่อน Mimir ปิด)

**Phase 1 — Export ทุกอย่างออกจาก Mimir (TIME-CRITICAL)**

พอ Mimir ปิด = เข้าไม่ได้อีก ต้องดึงออกให้ครบ **ก่อน** หมดสัญญา:

| ต้อง export | วิธี | ทำไมสำคัญ |
|---|---|---|
| **Metadata ทั้งหมด** (id, title, people, description, labels, date, folder, ความยาว/ขนาด) | Scroll API (มีอยู่แล้ว — ดึง 347k ได้) → dump JSON | กู้คืนไม่ได้ถ้าหาย |
| **Transcript (VTT)** ทุกไฟล์ | ดึงจาก Mimir ทีละ asset | Drive ไม่ถอดเทปให้ — ของนี้มีค่ามาก |
| **ไฟล์ต้นฉบับ Hi-res** | presigned URL → download ลง staging | คือตัวสื่อจริง |

→ เก็บ export ไว้ที่ปลอดภัย (bucket/NAS) เป็น "source of truth" ระหว่าง migration และเก็บถาวรเป็นประกัน

> ผมเขียนสคริปต์ export ให้ได้ โดยใช้ scroll API + Cognito auth ที่มีในโปรเจกต์อยู่แล้ว

---

## 🚧 Blocker ที่ต้องเช็คก่อนเริ่ม (อาจล้มแผนได้)

1. **พื้นที่ Google Workspace พอไหม** — วิดีโอ 347k รายการอาจเป็นหลาย TB. Workspace ใช้ pooled storage (Business Standard 2TB/user, Plus 5TB/user). **เช็คปริมาณจริงจาก Mimir/Wasabi ก่อน** ถ้าไม่พอ = ต้องซื้อเพิ่ม/archive บางส่วน → **นี่คือ blocker อันดับ 1**

2. **Shared Drive จำกัด 500,000 ไฟล์/ไดรฟ์** — 347k ใกล้เพดาน + ยังต้องเผื่อโต → วางแผน **แบ่งหลาย Shared Drive** (sharding) ตั้งแต่แรก

3. **Drive API quota** — index 347k + เสิร์ฟ thumbnail ต้องมี cache + exponential backoff อย่าค้นสด

4. **วิดีโอสตรีม** — Drive ไม่ใช่ CDN, thumbnail มี rate limit → ต้อง proxy + cache (อาจ transcode HLS ถ้าอยากลื่นจริง) — **prototype จุดนี้ก่อนตัดสินใจ**

5. **คุณภาพการค้นหา** — index Qdrant/Postgres ต้องดีเทียบเท่า Elasticsearch ของ Mimir → ต้องลงแรงตรงนี้

---

## Phase ทั้งหมด

### Phase 0 — Discovery & ตัดสินใจ (ก่อนเขียนโค้ด)
- [ ] นับจำนวนไฟล์ + ขนาดรวม (TB?) + สัดส่วนชนิดไฟล์ จาก Mimir
- [ ] เช็คพื้นที่ Workspace pooled storage (blocker #1)
- [ ] ออกแบบโครงสร้าง Shared Drive (1 หรือหลายตัว — เผื่อ 500k limit)
- [ ] Service Account + Domain-Wide Delegation (มีประสบการณ์จาก Production Booking)
- [ ] กำหนด metadata schema ที่จะเก็บ

### Phase 1 — Export จาก Mimir ⏰ (ด่วน — ดูข้างบน)

### Phase 2 — Upload ไฟล์ขึ้น Shared Drive
- [ ] อัปไฟล์ต้นฉบับขึ้น Shared Drive (โครงสร้าง mirror Mimir folders หรือจัดใหม่)
- [ ] Drive resumable upload + parallel + rate-limit aware (เคยอัปไฟล์ใหญ่จาก Production Booking)
- [ ] ใส่ `appProperties` ทุกไฟล์ = เก็บ Mimir ID เดิม (ไว้ map metadata) + ข้อมูลสำคัญ
- [ ] ระวัง 500k limit → แบ่ง Shared Drive

### Phase 3 — สร้าง index (ใช้ AI Metadata Tool ของเดิม)
- [ ] ชี้ indexer ไปที่ Drive (Changes API + files.list) แทน Mimir
- [ ] ต่อไฟล์: ดึง Drive metadata (`videoMediaMetadata` ความยาว/ขนาด, `imageMediaMetadata`) + merge กับ metadata ที่ export จาก Mimir (map ด้วย Mimir ID ใน appProperties)
- [ ] Gemini gen คำบรรยาย/คีย์เวิร์ดที่ขาด + ใส่ transcript (จาก export) + embed ลง Qdrant
- [ ] Postgres = metadata ค้นได้ · Qdrant = semantic vectors

### Phase 4 — เปลี่ยน data layer ในเว็บ
- [ ] แทนที่ Mimir API (`services/mimirAuth.js`, `models/mimirModel.js`) ด้วย:
  - ค้นหา → query Postgres/Qdrant (API ของ AI tool) แทน Mimir
  - Thumbnail → Drive `thumbnailLink` (proxy + cache เหมือน thumbnail proxy เดิม)
  - วิดีโอ/ดาวน์โหลด → Drive file (proxy stream หรือ signed link)
- [ ] Frontend (grid/modal/filters/dark mode) ใช้ของเดิม — เปลี่ยนแค่ source
- [ ] Auth = Google OAuth (เป็น Google อยู่แล้ว ไม่ต้องแก้)

### Phase 5 — Video playback & thumbnail (จุดยากสุด)
- [ ] Thumbnail กริด: Drive `thumbnailLink` + cache แรงๆ
- [ ] วิดีโอ: เลือก (ก) Drive preview iframe (เร็วสุด v1) / (ข) proxy stream รองรับ range request (player เอง) / (ค) transcode HLS (ลื่นสุด หนักสุด)
- [ ] **Prototype จุดนี้ก่อน** — Drive อ่อนเรื่องนี้

### Phase 6 — Cutover & ปิด Mimir
- [ ] รัน Drive-backed คู่ขนาน/staging → ทดสอบคุณภาพค้นหา + เล่นวิดีโอ บนข้อมูลจริง
- [ ] สลับ production data source
- [ ] เก็บ export (metadata + transcript) ถาวรเป็นประกัน
- [ ] Decommission Mimir

---

## ของที่มีอยู่แล้ว = ลดงานไปเยอะ

| มีแล้ว | ใช้ทำอะไรใน migration |
|---|---|
| AI Metadata Tool (Postgres + Qdrant + Gemini) | indexer + สมองค้นหา (~80% ของงานหลัก) |
| เว็บ frontend (grid/modal/filters) | ใช้ต่อ เปลี่ยนแค่ data layer |
| Google OAuth | auth เดิม ไม่ต้องแก้ |
| Mimir Scroll API | export 347k ก่อนปิด |
| DWD / Shared Drive / Changes API / resumable upload | ยืมแนวจาก Production Booking |

---

## ขั้นถัดไปที่แนะนำ (สัปดาห์นี้)

1. **เช็คพื้นที่ Workspace** (blocker — ทำก่อนอย่างอื่น)
2. **รัน export จาก Mimir เดี๋ยวนี้** (metadata + transcript + ต้นฉบับ) — ด่วนก่อนหมดสัญญา
3. **Prototype 1 folder** ครบวงจร: Drive → index → ค้นหา → เล่นวิดีโอ → ดูว่า quality/quota ผ่านไหม
4. ได้ผล prototype แล้วค่อยตัดสินใจ migration เต็ม + timeline

---

*ร่างโดยทีมพัฒนา · 2026-06-22 · ปรับได้ตามผลเช็คพื้นที่/prototype*

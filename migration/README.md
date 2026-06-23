# Migration tooling — Mimir → Google Drive

แผนเต็มอยู่ที่ [`../docs/migration-google-drive.md`](../docs/migration-google-drive.md)
ส่วนนี้คือ "เครื่องมือ Phase 1 — Export จาก Mimir ก่อนหมดสัญญา" (ทำได้ทันที ไม่ต้องรอ setup Google)

## ⏰ ทำไมต้องรีบ
Mimir offset `/search` ติดเพดาน 10,000 — ต้องใช้ **scroll API** ดึงครบ **373,740 รายการ**
พอ Mimir ปิด = ดึงไม่ได้อีก ของที่ **กู้ไม่ได้** คือ metadata + **transcript (VTT)**

## สคริปต์ `export-mimir.js` (ใช้ Cognito auth เดิม ไม่ต้องใส่ creds เพิ่ม)

รันตามลำดับ — `enrich`/`transcripts` รันซ้ำได้ (resume เองจากไฟล์ที่มีอยู่):

```bash
cd <repo root>

# 1) Manifest — ดึง ID ทั้งหมดผ่าน scroll (เร็ว, ~นาที)
node migration/export-mimir.js manifest

# 2) ประเมินขนาดคลังเร็วๆ (ตอบ blocker พื้นที่ Workspace) — sample 3,000 ชิ้น
node migration/export-mimir.js enrich --sample 3000
#   → out/inventory-report.json มี estTotalTB_extrapolated

# 3) Enrich เต็ม — per-item GET /items/{id} ได้ metadata เต็ม + size + vttUrl + highRes
#    373k requests ~หลายชั่วโมง · resume ได้ · ควรรันให้จบก่อน Mimir ปิด
node migration/export-mimir.js enrich

# 4) Transcripts — โหลด VTT ของทุกชิ้นที่มี (จาก items-full.jsonl)
node migration/export-mimir.js transcripts
```

## ผลลัพธ์ (`migration/out/`)

| ไฟล์ | คือ |
|---|---|
| `manifest.jsonl` | `{id,itemType,title}` ทุกชิ้น (373k) |
| `items-full.jsonl` | raw `GET /items/{id}` เต็ม (metadata, mediaSize, paths, vttUrl, highRes) |
| `inventory-report.json` | จำนวน + ขนาดรวม (GB/TB) + แยกตามชนิด → **ตอบ blocker พื้นที่** |
| `transcripts/<id>.vtt` | ไฟล์คำบรรยาย |

> `out/` ถูก gitignore — เป็นข้อมูล export ไม่ commit เข้า repo เก็บไว้ที่ปลอดภัย (NAS/bucket) เป็น source of truth ระหว่าง migration

## ยังขาด (ต้องตั้งค่าฝั่ง Google ก่อน — ทำต่อไม่ได้จนกว่าจะมี)
- **Service Account + Domain-Wide Delegation** (เข้าถึง Shared Drive)
- **Shared Drive** ปลายทาง (ระวัง 500k ไฟล์/ไดรฟ์ → 373k ต้องเผื่อแบ่ง)
- ยืนยัน **พื้นที่ Workspace** พอ (ดู inventory-report.json ก่อน)

จากนั้น (Phase 2–4): อัปต้นฉบับขึ้น Shared Drive (ใส่ Mimir ID ใน `appProperties`) → index ผ่าน AI Metadata Tool (Postgres + Qdrant + Gemini) → เปลี่ยน data layer ในเว็บให้ค้นจาก index + ดึงสื่อจาก Drive

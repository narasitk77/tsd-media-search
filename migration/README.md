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

## Phase 2 — อัปขึ้น Google Drive (`upload-to-drive.js`) ✅ โค้ดพร้อมแล้ว

สตรีมต้นฉบับจาก Mimir เข้า Drive ตรงๆ (ไม่ต้อง stage 14TB ลงเครื่อง) + ใส่ Mimir ID ใน `appProperties` + เก็บ mapping → **resume ได้**

**ต้องตั้ง env ก่อน 3 ตัว (รอจาก IT admin):**
```bash
GOOGLE_SA_KEY_FILE=/path/service-account.json   # service account JSON
DRIVE_SHARED_DRIVE_ID=0A...                      # Shared Drive ปลายทาง
GOOGLE_DWD_SUBJECT=you@thestandard.co            # (ออปชัน) impersonate ผ่าน DWD ถ้า SA ไม่ได้เป็นสมาชิก Shared Drive
# DRIVE_DEST_FOLDER_ID=...                        # (ออปชัน) โฟลเดอร์ย่อยใน Shared Drive
```

```bash
cd migration && npm install            # ติดตั้ง googleapis (แยกจากแอปหลัก)
node upload-to-drive.js --limit 20      # smoke test 20 ไฟล์ก่อน
node upload-to-drive.js                 # อัปเต็ม (resume ได้) · --refresh ถ้า URL หมดอายุ
#   → out/drive-mapping.jsonl : mimirId → driveFileId
```

> ⚠️ presigned URL จาก Mimir **หมดอายุ** — รัน upload ขณะ Mimir ยังเปิดอยู่ (หรือใส่ `--refresh` ให้ดึง URL ใหม่ต่อไฟล์)
> ⚠️ Shared Drive จำกัด **500k ไฟล์/ไดรฟ์** — 373k ใส่ได้ตัวเดียวแต่เผื่อโตควรแบ่ง (แก้ `DRIVE_SHARED_DRIVE_ID` รันหลายรอบต่อไดรฟ์)

## ยังต้องการจาก IT admin เพื่อรัน Phase 2
1. **Service Account JSON** + เปิด **Domain-Wide Delegation** (scope `drive`)
2. **Shared Drive ปลายทาง** (+ เพิ่ม SA หรือ subject เป็นสมาชิก)
3. ยืนยัน **พื้นที่ ~14TB** (ดู `out/inventory-report.json`)

## Phase 3–4 (หลัง Phase 2 มีข้อมูลใน Drive แล้ว)
- **Phase 3 — Index:** ชี้ AI Metadata Tool (Postgres + Qdrant + Gemini) ให้อ่านจาก Drive (Changes API) + merge metadata จาก `items-full.jsonl` (map ด้วย Mimir ID ใน appProperties) + ใส่ transcript จาก `out/transcripts/`
- **Phase 4 — เปลี่ยน data layer เว็บ:** แทน `models/mimirModel.js` ให้ค้นจาก index เรา + ดึง thumbnail/วิดีโอจาก Drive (frontend เดิมใช้ต่อ)

> Phase 3–4 ต้องรอ Drive มีไฟล์จริงก่อน (Phase 2 เสร็จ) ถึงจะ build + test ได้ — ไม่เขียนล่วงหน้าแบบเดาเพราะจะ test ไม่ได้

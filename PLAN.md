# PLAN — SSB Content Pipeline (โมดูล Marketing)

> อัปเดตล่าสุด: 25 ส.ค. 2569 (2026-08-25) · เจ้าของ: อาร์ต · CEO/coach: พี่ทัช
> เอกสารคู่กัน: [README.md](README.md) (โครง+กติกาเหล็ก) · [INTEGRATION.md](INTEGRATION.md) (seam ตอนย้ายแพลตฟอร์ม) · [SUPABASE.md](SUPABASE.md) (ต่อฐานข้อมูลจริง)

## เป้าหมาย

ทำให้ SOP คอนเทนต์ v1.1 ของ SSB Group **เดินได้จริงในระบบเดียว** — ทีม 4-5 คน (Content Owner · Team Lead) เดินงานครบ 7 ขั้น (Idea → Brief → Draft → Review → Scheduled → Published → Measured) ข้าม 4 แบรนด์ (TEAMDEE · JK Design · t around · JUNTAKARN) โดยกติกาบังคับอยู่ในระบบ ไม่ใช่ในหัวคน

## done-when (วัดได้)

**ทีมใช้จริงแทน Notion** — เกณฑ์ผ่าน:

1. งานจริงของทีม (ไม่ใช่ seed) เดินครบ 7 ขั้นในระบบนี้ **ติดกัน 1 เดือน**
2. ในเดือนนั้น **ไม่มีใครกลับไปเปิด Notion** เพื่อดูสถานะงานคอนเทนต์
3. ตัวเลขผลงาน (Reach/ER/Leads) ที่ใช้คุยในประชุม มาจากหน้า "ผลตอบรับ" ของระบบนี้
4. ข้อมูลไม่หายเมื่อปิดเบราว์เซอร์ (= ต่อ Supabase จริงแล้ว ไม่ใช่ localStorage)

## ขอบเขต

**อยู่ในขอบเขต**
- โมดูล `src/modules/marketing/` ทั้งก้อน (ยกไปแพลตฟอร์มได้)
- เปลือกแอปเท่าที่โมดูลต้องใช้: topbar · ตัวสลับแบรนด์ · nav · routes
- ข้อมูลเดโมด้วย localStorage → สลับเป็น Supabase ผ่าน seam เดียว (`data/DataStore.js`)

**นอกขอบเขต**
- repo `ssbgroup-platform` — ห้ามแตะ (ย้ายทีหลังตาม INTEGRATION.md)
- โมดูลอื่นของแพลตฟอร์ม (FINANCE · SALE/CRM · OEM · HR/GA) — เป็น placeholder
- ระบบล็อกอินจริง (เดโมใช้ DemoAuthProvider)

## Stack

React 19 · Vite · **JavaScript ล้วน** (ไม่มี TS) · Tailwind v4 (dark/light) · Chart.js 4 (ไม่ใช้ Recharts) · lucide-react · react-router-dom 7 · vitest (184 เคส) · Supabase (@supabase/supabase-js — ยังไม่เปิดใช้เป็นค่าเริ่มต้น)

**กติกาสไตล์ที่ห้ามฝ่าฝืน** (รายละเอียดใน README + memory)
- สี/ขนาดทุกค่ามาจาก token SSB ใน `mktStyles.css` — ห้าม hex ดิบ (ยกเว้นสีแบรนด์จากข้อมูล)
- dropdown ใช้ `MktSelect` เท่านั้น ห้าม `<select>` ดิบ
- CSS scope ใต้ `.mkt-root` — อะไรที่ render นอก wrapper ต้องครอบเอง
- ห้ามให้งานดู "AI ทำ": ไม่ใช้ emoji เป็นไอคอน · ไม่ใช้ gradient ม่วงฟุ้ง · ใช้ SVG icon

---

## สถานะปัจจุบัน (เสร็จแล้ว)

- **เครื่องยนต์ SOP ครบ** — gate 7 ขั้น · transition validation · สิทธิ์ · first-pass · audit log — คุมด้วยเทส 184 เคส (เขียวทั้งหมด)
- **6 หน้า**: บอร์ด · ลิสต์ · รอตรวจ · ปฏิทิน · คลัง · ตั้งค่า
- **Dashboard 4 แท็บ**: ภาพรวม · สายผลิต · วิเคราะห์ · ผลตอบรับ
- **popup ครบ**: การ์ดงาน (CardSheet) · โยนไอเดีย · ตีกลับ · รายภาพ · รายฉาก · คลัง · ยืนยัน
- **ผิว Premium Dark 2 ธีม** + การ์ด text-first + แถบพาร์ทิชัน "ความพร้อมขั้นนี้" + กล่องแนบรวม (รูป/ไฟล์/ลิ้ง ช่องเดียว)

**ข้อจำกัดที่ยอมรับไว้ก่อน**: รูปที่แนบใหม่เป็น object URL ราย session — refresh แล้วหาย (หายเองเมื่อทำข้อ 2 ด้านล่าง)

---

## งานที่เหลือ

### ข้อ 1 — รื้อ UI ใหม่ทีละหน้า/ทีละ popup (ทำอยู่)

รื้อทีละผิว **ห้ามรื้อพร้อมกันหลายหน้า** จบหน้าหนึ่งแล้วขึ้นหน้าถัดไป**เองโดยไม่ต้องรอสั่ง**

**นิยาม "จบ 1 ผิว" (ต้องครบทุกข้อถึงขึ้นผิวถัดไป)**
1. `npx vitest run` = 184 เขียว · `npm run build` ผ่าน · `npm run lint` warning ไม่เพิ่มจากเดิม
2. `design-audit` บนผิวนั้น — ไม่มี finding ระดับ 🔴 Critical / 🟠 Major ค้าง
3. screenshot จริงในเบราว์เซอร์ **ทั้ง 2 ธีม** (มืด+สว่าง) ที่ 1280px ขึ้นไป
4. ไม่มี console error จากโค้ดโมดูล
5. ยึด token SSB ครบ (ไม่มี hex ดิบใหม่)

**ลำดับผิว**
| # | ผิว | ไฟล์หลัก | สถานะ |
|---|---|---|---|
| 1.1 | บอร์ด (kanban) | `work/BoardView.jsx` + `mktCard.jsx` | ✅ **รื้อ + audit ผ่าน** — contrast ทุกจุด ≥4.94 · focus ring ครบ · ไม่มี emoji/overflow |
| 1.2 | การ์ดงาน (popup ใหญ่) | `detail/CardDrawer.jsx` (1,505 บรรทัด) | 🔧 รื้อแล้ว **ยังไม่ audit** — 3 คอลัมน์ + ไทล์แท็บขั้น + property rows + ไทม์ไลน์ประวัติ |
| 1.3 | ลิสต์ | `work/ListView.jsx` | ✅ **รื้อ + audit ผ่าน** — แถบต่อเนื่อง + n/n + ✓ (เลิกบาร์โค้ด 1.1px) |
| 1.4 | ปฏิทิน | `work/CalendarView.jsx` | ✅ **รื้อ + audit ผ่าน** — รูปใต้ข้อความ · gate พาร์ทิชัน + ✓ |
| 1.5 | คิวรอตรวจ | `work/ReviewQueue.jsx` (370) | ⬜ ยังไม่รื้อ |
| 1.6 | คลัง | `work/ArchiveView.jsx` (347) | ⬜ ยังไม่รื้อ |
| 1.7 | Dashboard 4 แท็บ | `dash/DashboardView.jsx` + `dash/*` | ⬜ เหลือแท็บ สายผลิต/วิเคราะห์/ผลตอบรับ |
| 1.8 | ตั้งค่า (admin) | `admin/AdminView.jsx` | ⬜ ยังไม่รื้อ |
| 1.9 | popup ย่อย | `IdeaDialog` · `RejectDialog` · FrameSheet · SceneSheet · ArchiveSheet | ⬜ ยังไม่รื้อ |

**บทเรียนจาก audit รอบแรก (ใช้เป็นเช็คลิสต์ของผิวถัดไป)**
- วัด contrast ต้องแปลง `oklch()` / `color(srgb)` เอง + ผสม alpha ของพื้นโปร่งแสงก่อน — ไม่งั้นได้ตัวเลขมั่ว (เคยได้ 2.88 เท่ากันหมด และ 1.04 ที่จริงคือ 4.94)
- อย่า hardcode สีตัวอักษรบนสีแบรนด์ — ใช้ `brandFill()` ที่คำนวณ WCAG ให้แล้ว (TEAMDEE ส้ม + ขาว = 3.04 ตก)
- ทุก `role="button"` / `tabIndex=0` ต้องมี focus ring — ทดสอบด้วยการกด Tab จริง (`.focus()` จาก script ไม่ทำให้ `:focus-visible` ติด)

**หนี้ที่ต้องเก็บระหว่างทาง**
- ปุ่ม/แท็บส่วนใหญ่สูง 28–32px (ต่ำกว่า 44px ของเกณฑ์สัมผัส) — ยอมรับได้เพราะเดสก์ท็อปเป็นหลัก แต่ถ้าวันหนึ่งใช้บนแท็บเล็ตต้องขยาย
- `mktStyles.css` 2,440 บรรทัด — ตัด dead CSS ต่อ (รอบแรกลบไป 205 rule แล้ว) และระวังสคริปต์ลบอัตโนมัติกินกฎที่ยังใช้ (เคยพังมา 3 ครั้ง — ต้อง grep ยืนยันก่อนลบทุกคลาส)
- ธีมสว่าง `--ok` (#d85510) ใกล้ `--accent` (#df5a15) เกินไป → สถานะ "ครบแล้ว" แยกไม่ออกด้วยสี ต้องมีสัญญาณอื่น (✓/ตัวเลข) ไม่พึ่งสีอย่างเดียว
- README บรรทัด "ตรรกะทั้งหมดอยู่ใน `src/domain/rules.ts`" — path ผิด (จริงคือ `mktRules.js`) แก้ให้ตรง

### ข้อ 2 — ต่อ Supabase จริง

ทำหลังข้อ 1 จบ (UI นิ่งแล้วค่อยเปลี่ยนชั้นข้อมูล จะได้ไม่ debug 2 ชั้นพร้อมกัน)
1. รัน SQL migration ตาม `SUPABASE.md` + ใส่คีย์ 2 ค่า
2. สลับ `data/DataStore.js` จาก localStore → Supabase (seam เดียว ไม่แตะ UI)
3. รูปแนบขึ้น Supabase Storage — แก้ข้อจำกัด "refresh แล้วรูปหาย" (จุดอ่านจุดเดียวคือ `attachmentUrl()` ใน `detail/Attachments.jsx`)
4. เทส 184 ต้องยังเขียว + ทดสอบ refresh แล้วข้อมูล/รูปอยู่ครบ

> ⚠️ กฎข้อ 3 ของอาร์ต: **แตะ Supabase ต้องถามก่อนทุกครั้ง** — บอกจะทำอะไร · กระทบอะไร · ทางเลือกอื่น แล้วรอคำตอบ

### ข้อ 3 — เลือก hosting + ขึ้นจริง

ยังไม่ตัดสิน (ตัวเลือกหลัก: Vercel) ทำหลังข้อ 2 · ใช้ `/release` เป็น gate ก่อน deploy

---

## กติกาการทำงานของโปรเจกต์นี้

1. **ไม่ commit/push จนกว่าอาร์ตสั่ง** — ทำเสร็จ + verify แล้วรายงานว่าพร้อม commit
2. **"เสร็จ" ต้องมีหลักฐาน** — เทสเขียว/screenshot/output จริง ห้ามเคลมลอยๆ
3. **แตะ Supabase/Vercel ต้องถามก่อน** (แม้แค่อ่าน)
4. **ประกาศ skill** ก่อนเริ่มงานหลายขั้น และสรุปตอนจบ
5. เจอบั๊ก → `systematic-debugging` หา root cause ก่อนแก้ · งาน UI → `ui-ux-pro-max` แล้ว `design-audit` + screenshot จริง

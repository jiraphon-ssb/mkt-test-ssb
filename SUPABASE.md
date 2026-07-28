# ต่อ Supabase — โหมดไม่ต้องล็อกอิน (no-login)

> ทำ 3 ขั้น ~5 นาที · ยังไม่มีคีย์ก็ใช้แอปได้ปกติ (โหมด localStorage)

## ขั้น 1 — รัน SQL (ครั้งเดียว)

1. เปิดโปรเจกต์ใน [supabase.com](https://supabase.com) → เมนูซ้าย **SQL Editor** → **New query**
2. ก๊อปทั้งไฟล์ [`supabase/schema_nologin.sql`](supabase/schema_nologin.sql) วางแล้วกด **Run**
3. ตรวจว่าผ่าน: รัน `select mkt_load_state();` — ครั้งแรกจะได้อาร์เรย์ว่างทุกก้อน (ถูกต้องแล้ว)

ไฟล์นี้ทำให้ครบในทีเดียว: 12 ตาราง · view รวมยอดรายช่องทาง · RLS เปิดให้ anon ·
2 ฟังก์ชันที่แอปเรียก (`mkt_load_state` / `mkt_save_state`) · bucket `mkt-files` สำหรับไฟล์แนบ
รันซ้ำได้ (ล้างของเดิมก่อนสร้างใหม่)

## ขั้น 2 — ใส่คีย์

Supabase → **Project Settings → API Keys** แล้วเอา 2 ค่านี้มาใส่ `.env` (ก๊อปจาก `.env.example`):

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env` อยู่ใน `.gitignore` แล้ว — ไม่ขึ้น GitHub · **ใส่ได้เฉพาะ anon key** ห้ามใส่ `service_role`

## ขั้น 3 — สลับให้แอปใช้ Supabase

แก้ [`src/modules/marketing/data/DataStore.js`](src/modules/marketing/data/DataStore.js) บรรทัดสุดท้าย:

```js
// export { store } from "./localStore.js";     // เดโม: localStorage
export { store } from "./supabaseStore.js";     // ของจริง: Supabase
```

แล้วใน `src/main.jsx` ให้ `await bootstrapSupabase()` ก่อน render (โหลด state ครั้งเดียวตอนเปิดแอป):

```js
import { bootstrapSupabase } from "./modules/marketing/data/supabaseStore.js";
await bootstrapSupabase();   // ไม่มีคีย์ = คืน false เฉยๆ ไม่พัง
```

เปิดแอปครั้งแรกเมื่อฐานยังว่าง ระบบจะดันข้อมูลเดโมขึ้นให้อัตโนมัติ (จะได้เห็นของทันที)

---

## โหมดนี้ปลอดภัยแค่ไหน — อ่านก่อนใช้

| | โหมดนี้ (no-login) | โหมดของจริง (ทีหลัง) |
|---|---|---|
| ใครเข้าได้ | ใครก็ได้ที่มี URL + anon key | ต้อง login + ตรวจสิทธิ์ราย role |
| RLS | เปิดไว้ แต่ policy อนุญาตทุกอย่าง | policy select เท่านั้น · เขียนผ่าน RPC |
| เหมาะกับ | เดโม · ใช้ในทีมภายใน · ทดลอง | ข้อมูลจริงของลูกค้า |

**ห้ามใส่ข้อมูลลับ/ข้อมูลลูกค้าจริง** ในโหมดนี้ — anon key ฝังอยู่ใน bundle ฝั่ง client เสมอ
ใครเปิด DevTools ก็เห็น จึงเท่ากับเปิดฐานให้แก้ได้

**วันเปลี่ยนเป็นของจริง** ไม่ต้องรื้อสคีมา แค่:
1. ลบ policy `*_open` ทั้ง 12 ตัว แล้วใส่ policy ที่ตรวจ `auth.uid()`
2. เปลี่ยน `mkt_save_state` (เขียนทั้งก้อน) เป็น RPC ราย action — ผังพร้อมใช้อยู่ใน
   [INTEGRATION.md](INTEGRATION.md) หัวข้อ "ผัง RPC"
3. ผูก `mkt_profile.id` กับ `auth.users`

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ · วิธีแก้ |
|---|---|
| `Invalid value` ตอน fetch | คีย์มีขึ้นบรรทัดใหม่ติดมา — ลบ newline ท้ายคีย์ใน `.env` |
| เปิดแอปแล้วข้อมูลว่าง | ยังไม่ได้รัน SQL หรือรันคนละโปรเจกต์กับ URL ใน `.env` |
| แก้ข้อมูลแล้วไม่บันทึก | เปิด Console ดู `[supabaseStore] บันทึกไม่สำเร็จ` — ปกติคือยังไม่ได้รัน SQL ครบไฟล์ |
| แก้ `.env` แล้วไม่มีผล | Vite อ่าน env ตอน start — ต้อง restart dev server |

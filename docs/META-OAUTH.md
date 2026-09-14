# Meta Ads OAuth (read-only)

ระบบขอสิทธิ์ `ads_read` เท่านั้น Token อยู่ใน Edge Functions และถูกเข้ารหัส AES-256-GCM ก่อนเก็บฐานข้อมูล Browser จะได้รับเฉพาะสถานะและรายชื่อ Ad Account

## 1. เตรียมฐานข้อมูล

ฐานจริงของโปรเจกต์นี้ใช้ schema `mkt_*` (id เป็น text, ไม่มีตาราง `profiles`/`brands`) migration 0005–0007 จึงถูกปรับให้อ้าง `mkt_brand` / `mkt_profile` และตรวจสิทธิ์ผ่าน `mkt_is_team_lead()` — **ห้ามรัน 0001–0004** บนฐานนี้ (เป็น schema คนละสาย)

รัน `src/supabase/migrations/0005_ads_data.sql` → `0006_ad_creatives.sql` → `0007_meta_oauth.sql` → `0008_harden_mkt_save_state.sql` ตามลำดับ (สำเนาแบบ timestamp อยู่ใน `supabase/migrations/` สำหรับ `supabase db push`) · rollback: `src/supabase/migrations/rollback/0005-0008_down.sql`

ผลข้างเคียงที่ตั้งใจของ 0008: `mkt_save_state`/`mkt_load_state` **เรียกด้วย anon key ไม่ได้อีก** — แอปต้องรันโหมด `VITE_AUTH_MODE=supabase` และล็อกอินก่อน (โหมด no-login ใช้ได้กับ mock/localStorage เท่านั้น) · คนที่ไม่ใช่ `team_lead` บันทึกสถานะได้แต่เปลี่ยน role/active ของโปรไฟล์ไม่ได้

จากนั้น **ผูกผู้ใช้ Auth กับโปรไฟล์ทีม** — ทำใน SQL Editor (รันเป็น `postgres`) หรือด้วย service role · client (anon/authenticated) แก้ `auth_user_id` / `role` / `active` ตรงๆ ไม่ได้ มี trigger `mkt_profile_guard_privileges` กันทั้ง insert · update · delete:

```sql
update mkt_profile
set auth_user_id = '<auth-user-uuid>'
where id = '<mkt_profile.id เช่น u_xxx>' and role = 'team_lead';
```

Edge Functions และ RLS ของตาราง ads จะถือว่าเป็น `team_lead` เฉพาะแถวที่ `auth_user_id` ตรงกับผู้ล็อกอิน และ `active = true`

## 2. ตั้งค่า Meta App

ใน Meta App Dashboard เพิ่ม Marketing API แล้วตั้ง Valid OAuth Redirect URI ให้ตรงทุกตัวอักษรกับ:

```text
https://<project-ref>.supabase.co/functions/v1/ads-oauth-callback
```

โหมดทดลองต้องเพิ่มผู้ทดสอบเป็น App Role และผู้กดเชื่อมต้องมีสิทธิ์ใน Ad Account ที่ต้องการอ่าน เมื่อเปิดให้คนนอกทีมใช้จึงทำ App Review/Advanced Access ตามข้อกำหนดของ Meta

## 3. ตั้ง Server secrets

สร้างกุญแจเข้ารหัสหนึ่งครั้ง:

```bash
openssl rand -base64 32
```

ตั้งค่า secrets ใน Supabase ห้ามเติมค่าเหล่านี้ใน `.env` ของ Vite:

```bash
supabase secrets set \
  META_APP_ID='<app-id>' \
  META_APP_SECRET='<app-secret>' \
  META_GRAPH_VERSION='v26.0' \
  META_OAUTH_REDIRECT_URI='https://<project-ref>.supabase.co/functions/v1/ads-oauth-callback' \
  ADS_APP_ORIGIN='https://<dashboard-domain>' \
  ADS_ALLOWED_ORIGINS='https://<dashboard-domain>,http://127.0.0.1:5174' \
  ADS_TOKEN_ENCRYPTION_KEY='<base64-32-byte-key>'
```

`SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` มีใน Edge Function environment อยู่แล้ว

## 4. Deploy Functions

Callback ต้องรับ redirect จาก Meta จึง deploy โดยไม่บังคับ JWT ส่วนฟังก์ชันอื่นต้องมี Supabase session และตรวจว่า profile เป็น `team_lead`

```bash
supabase functions deploy ads-oauth-start
supabase functions deploy ads-oauth-status
supabase functions deploy ads-oauth-disconnect
supabase functions deploy ads-oauth-callback --no-verify-jwt
```

เปิด `VITE_AUTH_MODE=supabase` และล็อกอินด้วย profile บทบาท `team_lead` ก่อนทดสอบ ปุ่มเชื่อมจะไม่ทำงานในโหมด no-login เพื่อไม่เปิด token จริงให้ผู้ที่มี URL ทุกคน

## 5. ทดสอบ

1. เข้า `Overview ads → ตั้งค่า → บัญชี`
2. กด `เชื่อมบัญชี` ที่ Meta Ads
3. ยืนยันเฉพาะสิทธิ์อ่านโฆษณา
4. กลับมาหน้าตั้งค่าและเลือก `act_...` ให้แต่ละแบรนด์
5. ตรวจว่าสถานะแสดง `OAuth เชื่อมแล้ว`

ปุ่ม `ยกเลิก` เรียก Meta เพิกถอน permission แล้วลบ token ที่เข้ารหัสและรายชื่อบัญชีออกจากฐานข้อมูล

## 6. ดึงยอดจริง (Meta Pilot)

ต้องมี migration `0010_ads_sync_worker.sql` และ deploy 2 ฟังก์ชันเพิ่ม (ทั้งคู่บังคับ JWT + `team_lead`)

```bash
supabase functions deploy ads-connections
supabase functions deploy ads-sync
```

| ขั้น | เกิดอะไรขึ้น |
|---|---|
| ตั้งค่า → บัญชี → เปิด "เตรียมดึง" → บันทึก | `ads-connections` สร้าง/อัปเดต `ad_connections` เฉพาะบัญชีที่ผู้บันทึกเชื่อม OAuth เอง · บัญชีที่ปิด mapping = `disabled` (ยอดเก่ายังอยู่) · เหตุผลที่ผูกไม่ได้ขึ้นในแถวแบรนด์ |
| สถานะ Sync → ดึงข้อมูลตอนนี้ | `ads-sync` ทีละบัญชี · ครั้งแรก = ย้อนหลังตาม "ย้อนหลัง" ในตั้งค่า · ครั้งต่อไป = 3 วันล่าสุดตาม timezone บัญชี |
| ภาพรวม / แคมเปญ / Creative → ข้อมูล · Meta Pilot | เห็นเฉพาะ `team_lead` · ตัดการ์ดแอดจำลองออกทั้งหมดก่อนแสดงยอดจริง |

กติกาของ worker (`supabase/functions/_shared/metaInsights.js` · `adsSyncJob.js` — มีเทส)

- Insights รายวัน `level=ad` ขอเป็นก้อนละ 7 วัน ตามทุกหน้า · rate limit/ชั่วคราว retry แบบ backoff สูงสุด 4 ครั้ง · token/สิทธิ์เสีย หยุดทันที
- ผลลัพธ์ = lead event ที่เลือกในตั้งค่า · ยอดขาย = มูลค่า purchase ที่ Meta attribute (บัญชีที่ไม่เคยมี purchase = ไม่รู้ ไม่ใช่ ฿0)
- ได้ข้อมูลไม่ครบหรือแถวผิดรูป = run `failed` และไม่แตะยอดเดิม · เขียนผ่าน RPC `ads_replace_daily_facts` (ลบ+ใส่ช่วงวันใน transaction เดียว เรียกได้เฉพาะ service_role)
- รันซ้อนบัญชีเดียวกันไม่ได้ (unique index) · run ค้างเกิน 15 นาทีถูกปิดเป็น `STALE_RUN` ก่อนเริ่มรอบใหม่

ข้อจำกัดที่รู้ตอนนี้: บัญชีใหญ่มากที่ backfill 90–180 วันอาจเกินเวลาของ Edge Function หรือขนาด payload → ลดจำนวนวันย้อนหลังในตั้งค่าก่อน · ยังไม่มี cron (กดดึงเอง)

## ขอบเขตของขั้นนี้

OAuth · account discovery · สร้าง `ad_connections` · ดึง Insights รายวัน · สลับหน้า ads เป็นยอดจริง (Pilot) พร้อมแล้ว
ขั้นถัดไป: เทียบยอด 7 และ 30 วันกับ Ads Manager และสุขภาพข้อมูลจากฐานจริง · Creative worker → `ad_creatives` · cron · เปิดให้ทุกคนเห็นยอดจริงหลังตรวจยอดผ่าน

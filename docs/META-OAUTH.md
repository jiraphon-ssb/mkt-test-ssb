# Meta Ads OAuth (read-only)

ระบบขอสิทธิ์ `ads_read` เท่านั้น Token อยู่ใน Edge Functions และถูกเข้ารหัส AES-256-GCM ก่อนเก็บฐานข้อมูล Browser จะได้รับเฉพาะสถานะและรายชื่อ Ad Account

## สถานะเซิร์ฟเวอร์เทส (อัปเดต 15 ก.ย. 2026)

| รายการ | ค่า / สถานะ |
|---|---|
| Supabase project | `mkt-test-ssb` · ref `lzvftqhffqefqupwulus` · region ap-south-1 |
| Project URL | `https://lzvftqhffqefqupwulus.supabase.co` |
| Migration ที่ apply แล้ว | 0005–0008 · 0009 (`ads_control`) · 0010 (`20260914163737_ads_sync_worker`) — release v0.3.0 |
| Edge Functions ที่ deploy แล้ว | `ads-oauth-start` · `ads-oauth-status` · `ads-oauth-disconnect` · `ads-oauth-callback` (ไม่บังคับ JWT) · `ads-connections` · `ads-sync` |
| ผู้ใช้ team_lead ที่ผูกแล้ว | login `jiraphon.e` → โปรไฟล์ `u_art` |
| แอปฝั่งหน้าบ้าน | ยังไม่มี hosting · ทดสอบที่ `http://localhost:5173` ด้วย `VITE_AUTH_MODE=supabase` (ตั้งใน `.env.local` แล้ว) |
| Meta App | **ยังไม่ได้สร้าง / ยังไม่ได้ส่ง App ID มา** |
| Server secrets ของ Meta | **ยังไม่ได้ตั้ง** (ณ 14 ก.ย. · callback ตอบ 500 จนกว่าจะตั้งครบ) · ตรวจชื่อที่ตั้งแล้วด้วย `npx supabase secrets list` |

ที่เหลือคือข้อ 2 และ 3 ของคู่มือนี้ ซึ่งต้องทำเองเพราะมี App Secret และกุญแจเข้ารหัส จากนั้นทดสอบตามข้อ 5 และ 6

## 1. เตรียมฐานข้อมูล — ทำแล้ว

> เซิร์ฟเวอร์เทสทำครบแล้ว (ดูตารางสถานะ) · ส่วนนี้เก็บไว้สำหรับตั้งฐานใหม่

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
https://lzvftqhffqefqupwulus.supabase.co/functions/v1/ads-oauth-callback
```

ค่าที่ต้องกรอกใน Meta App Dashboard

| ช่อง | ค่า |
|---|---|
| Use case / Product | Marketing API (สิทธิ์ `ads_read`) |
| Valid OAuth Redirect URIs | `https://lzvftqhffqefqupwulus.supabase.co/functions/v1/ads-oauth-callback` |
| App Domains | `lzvftqhffqefqupwulus.supabase.co` |
| App Roles → Testers | บัญชี Facebook ของคนที่จะกดเชื่อม (ต้องมีสิทธิ์ใน Ad Account ของแต่ละแบรนด์) |

ค่าที่ต้องจดกลับมา: **App ID** และ **App Secret** (Settings → Basic) · App Secret ห้ามส่งในแชทหรือใส่ไฟล์ใน repo

โหมดทดลองต้องเพิ่มผู้ทดสอบเป็น App Role และผู้กดเชื่อมต้องมีสิทธิ์ใน Ad Account ที่ต้องการอ่าน เมื่อเปิดให้คนนอกทีมใช้จึงทำ App Review/Advanced Access ตามข้อกำหนดของ Meta

## 3. ตั้ง Server secrets

สร้างกุญแจเข้ารหัสหนึ่งครั้ง:

```bash
openssl rand -base64 32
```

ตั้งค่า secrets ใน Supabase ห้ามเติมค่าเหล่านี้ใน `.env` ของ Vite:

ค่าที่เติมให้แล้วใช้ได้ทันทีกับการทดสอบบนเครื่อง · เหลือ 3 ค่าในวงเล็บเหลี่ยมที่ต้องใส่เอง (รันในโฟลเดอร์ `ssb-content-pipeline`)

```bash
npx supabase secrets set --project-ref lzvftqhffqefqupwulus \
  META_APP_ID='<App ID จาก Meta>' \
  META_APP_SECRET='<App Secret จาก Meta>' \
  META_GRAPH_VERSION='v26.0' \
  META_OAUTH_REDIRECT_URI='https://lzvftqhffqefqupwulus.supabase.co/functions/v1/ads-oauth-callback' \
  ADS_APP_ORIGIN='http://localhost:5173' \
  ADS_ALLOWED_ORIGINS='http://localhost:5173,http://127.0.0.1:5173' \
  ADS_TOKEN_ENCRYPTION_KEY='<ผลจาก openssl rand -base64 32>'
```

| Secret | ค่า | ที่มา |
|---|---|---|
| `META_APP_ID` | ต้องใส่เอง | Meta App → Settings → Basic |
| `META_APP_SECRET` | ต้องใส่เอง | Meta App → Settings → Basic · ห้ามเผยแพร่ |
| `META_GRAPH_VERSION` | `v26.0` | ค่าเริ่มของโค้ด · เปลี่ยนเมื่อ Meta เลิกรองรับ |
| `META_OAUTH_REDIRECT_URI` | callback ของโปรเจกต์นี้ | ต้องตรงกับที่กรอกใน Meta ทุกตัวอักษร |
| `ADS_APP_ORIGIN` | `http://localhost:5173` | origin ของแอปที่กลับมาหลังเชื่อม · ต้องตรงกับ URL ที่เปิดแอปจริง (`localhost` กับ `127.0.0.1` ถือเป็นคนละ origin) |
| `ADS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | origin ที่เรียก function จาก browser ได้ (CORS) |
| `ADS_TOKEN_ENCRYPTION_KEY` | ต้องสร้างเอง | `openssl rand -base64 32` · **ตั้งครั้งเดียว** ถ้าเปลี่ยนภายหลัง token ที่เก็บไว้จะถอดรหัสไม่ได้ ต้องเชื่อม Meta ใหม่ |

เมื่อมี domain จริงของแอป ให้ตั้ง `ADS_APP_ORIGIN='https://<domain>'` และเพิ่ม domain นั้นหน้า `ADS_ALLOWED_ORIGINS` (ไม่ต้อง deploy function ใหม่ secrets มีผลรอบเรียกถัดไป)

`SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` มีใน Edge Function environment อยู่แล้ว ไม่ต้องตั้ง

## 4. Deploy Functions — ทำแล้ว

> เซิร์ฟเวอร์เทส deploy ครบ 6 ตัวแล้วด้วย `npx supabase functions deploy <ชื่อ> --use-api` (เครื่องนี้ไม่มี Docker) · ส่วนนี้เก็บไว้สำหรับ deploy ใหม่

Callback ต้องรับ redirect จาก Meta จึง deploy โดยไม่บังคับ JWT ส่วนฟังก์ชันอื่นต้องมี Supabase session และตรวจว่า profile เป็น `team_lead`

```bash
supabase functions deploy ads-oauth-start
supabase functions deploy ads-oauth-status
supabase functions deploy ads-oauth-disconnect
supabase functions deploy ads-oauth-callback --no-verify-jwt
```

เปิด `VITE_AUTH_MODE=supabase` และล็อกอินด้วย profile บทบาท `team_lead` ก่อนทดสอบ ปุ่มเชื่อมจะไม่ทำงานในโหมด no-login เพื่อไม่เปิด token จริงให้ผู้ที่มี URL ทุกคน

## 5. ทดสอบ

0. รันแอป `npm run dev` แล้วเปิด `http://localhost:5173` ล็อกอินด้วย `jiraphon.e`
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

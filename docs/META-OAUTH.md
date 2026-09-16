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
| แอปฝั่งหน้าบ้าน | `https://mkt-test-ssb.vercel.app` (ต้องตั้ง `VITE_AUTH_MODE=supabase` ใน Vercel) · ทดสอบบนเครื่องที่ `http://localhost:5173` |
| Meta App | สร้างแล้ว · App ID `1048047581400827` · โหมดทดลอง (คนเชื่อมต้องอยู่ใน App Roles) |
| Server secrets ของ Meta | ตั้งครบ 7 ค่าแล้ว (15 ก.ย.) · ตรวจชื่อด้วย `npx supabase secrets list` |

## ใครทำอะไรได้ (ตั้งแต่ v0.4.0)

| ผู้ใช้ | ทำได้ |
|---|---|
| สมาชิกทีม (ผู้ใช้ Auth ที่ผูกกับ `mkt_profile` ที่ active) | ล็อกอินครั้งเดียว (เบราว์เซอร์จำ session) · เชื่อม / ดู / ยกเลิก Meta ของตัวเอง · token ของแต่ละคนแยกกัน คนอื่นมองไม่เห็น |
| `team_lead` | ทุกอย่างของสมาชิก + เห็นบัญชีที่ทุกคนในทีมเชื่อมไว้ · ผูกบัญชีกับแบรนด์ · บันทึกตั้งค่า · สั่งดึงข้อมูล · ดู Meta Pilot |

**เพิ่มสมาชิกใหม่ 3 ขั้น**
1. Supabase Dashboard → Authentication → Users → Add user (อีเมล + รหัสผ่าน) หรือ Invite
2. ผูกกับโปรไฟล์ทีมใน SQL Editor (client ทำเองไม่ได้ มี trigger กัน):
   ```sql
   update mkt_profile set auth_user_id = '<uuid ของผู้ใช้จากขั้น 1>' where id = '<mkt_profile.id>' and auth_user_id is null;
   ```
3. Meta App → App Roles → เพิ่มบัญชี Facebook ของคนนั้นเป็น Tester แล้วให้เขากดยอมรับคำเชิญ (จนกว่าแอปจะผ่าน App Review)

สมาชิกออกจากทีม: ปิด `active` ของโปรไฟล์ (SQL Editor) · token ของคนนั้นหยุดถูกใช้ผูกบัญชีและดึงข้อมูลทันที · ให้ team_lead ผูกบัญชีนั้นกับ token ของคนอื่นแทน

ลิงก์เว็บเปิดได้หลาย origin พร้อมกัน: ระบบพากลับไปหน้าเดิมที่กดเชื่อม ถ้า origin นั้นอยู่ใน `ADS_ALLOWED_ORIGINS` · ไม่อยู่ = กลับไปที่ `ADS_APP_ORIGIN`

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

### สิทธิ์อ่านเพจ (ภาพของโฆษณาแบบบูสต์โพสต์ · ตั้งแต่ v0.8.0)

โฆษณาส่วนใหญ่เป็นการบูสต์โพสต์เพจเดิม Meta ให้แค่รูปโปรไฟล์เพจผ่าน `ads_read` จึงขอสิทธิ์อ่านเพจเพิ่ม (อ่านอย่างเดียว)

1. Meta App → Use cases → Customize ของ use case ที่มี `pages_read_engagement` → ตรวจว่า `pages_show_list` และ `pages_read_engagement` เป็น Ready for testing (ถ้ามีปุ่ม Add ให้กด)
2. บัญชี Facebook ที่เชื่อมต้องมีบทบาทในเพจของทุกแบรนด์ (เช่น Admin/Editor/Moderator)
3. ในแอป: หน้าตั้งค่า → บัญชี → กด "เชื่อมใหม่" → ในหน้า Facebook เลือกเพจทุกเพจที่ยิงแอด
4. สถานะ Sync → ดึงข้อมูลตอนนี้ → การ์ด Creative ได้ภาพจากโพสต์จริง

Page access token ใช้เฉพาะในคำขอดึง Creative ไม่ถูกเก็บลงฐานหรือ log · ไม่ให้สิทธิ์เพจ = ระบบยังทำงานปกติ แค่การ์ดของโฆษณาแบบบูสต์โพสต์เป็นรูปโปรไฟล์เพจ

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
  ADS_APP_ORIGIN='https://mkt-test-ssb.vercel.app' \
  ADS_ALLOWED_ORIGINS='https://mkt-test-ssb.vercel.app,http://localhost:5173,http://127.0.0.1:5173' \
  ADS_TOKEN_ENCRYPTION_KEY='<ผลจาก openssl rand -base64 32>'
```

| Secret | ค่า | ที่มา |
|---|---|---|
| `META_APP_ID` | ต้องใส่เอง | Meta App → Settings → Basic |
| `META_APP_SECRET` | ต้องใส่เอง | Meta App → Settings → Basic · ห้ามเผยแพร่ |
| `META_GRAPH_VERSION` | `v26.0` | ค่าเริ่มของโค้ด · เปลี่ยนเมื่อ Meta เลิกรองรับ |
| `META_OAUTH_REDIRECT_URI` | callback ของโปรเจกต์นี้ | ต้องตรงกับที่กรอกใน Meta ทุกตัวอักษร |
| `ADS_APP_ORIGIN` | `https://mkt-test-ssb.vercel.app` | origin ค่าเริ่มที่พากลับหลังเชื่อม (ใช้เมื่อหน้าที่กดเชื่อมไม่อยู่ในรายชื่อด้านล่าง) |
| `ADS_ALLOWED_ORIGINS` | `https://mkt-test-ssb.vercel.app,http://localhost:5173,http://127.0.0.1:5173` | origin ที่เรียก function จาก browser ได้ (CORS) และพากลับได้ · `localhost` กับ `127.0.0.1` ถือเป็นคนละ origin · ไม่อยู่ในรายชื่อ = ขึ้น "เรียกระบบหลังบ้านไม่ได้" |
| `ADS_TOKEN_ENCRYPTION_KEY` | ต้องสร้างเอง | `openssl rand -base64 32` · **ตั้งครั้งเดียว** ถ้าเปลี่ยนภายหลัง token ที่เก็บไว้จะถอดรหัสไม่ได้ ต้องเชื่อม Meta ใหม่ |

เพิ่ม domain ใหม่ของแอป: ต่อท้าย `ADS_ALLOWED_ORIGINS` (ไม่ต้อง deploy function ใหม่ secrets มีผลรอบเรียกถัดไป)

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

ดึงยอดแบบแบ่งช่วง (v0.6.0): ปุ่มดึงข้อมูลหาช่วงวันที่ขาดจากประวัติ run แล้วดึงทีละ ≤10 วัน ตั้ง "ย้อนหลัง" 90–180 วันได้ · ต่อด้วยดึง Creative (`ads-creatives`)

## 7. ดึงและตรวจยอดอัตโนมัติ (pg_cron)

`pg_cron` job ชื่อ `ads-sync-tick` เรียก `ads_ops.cron_tick()` ทุกชั่วโมงนาทีที่ 7 → `net.http_post` ไปที่ Edge Function `ads-cron` (service role เท่านั้น) แล้ว `ads-cron` เป็นคนตัดสินว่ารอบนั้นต้องทำอะไร

| เรื่อง | กติกา |
|---|---|
| ดึงซ้ำ | บัญชีที่ run สำเร็จล่าสุดเก่ากว่าค่า "ดึงทุก X ชั่วโมง" ในหน้าตั้งค่า → ดึง 3 วันล่าสุด |
| เติมช่องว่าง | บัญชีที่มีวันที่ขาด → ทำได้เลยไม่ต้องรอครบรอบ และรอบนั้นหยิบเฉพาะก้อนย้อนหลัง |
| เพดานต่อรอบ | ดึง ≤4 ก้อน (บัญชีละ 1) · ตรวจยอด ≤4 บัญชี · บัญชีที่ค้างนานสุดได้คิวก่อน |
| ตรวจยอด | วันละครั้งต่อบัญชี หลัง 9 โมงตามโซนเวลาบัญชี และเฉพาะบัญชีที่ไม่มีวันที่ขาด → `ads-reconcile` |
| กันชนกัน | บัญชีที่มี run กำลังวิ่ง (ยังไม่เกิน 8 นาที) ถูกข้าม · token หมดอายุ = หยุดรอบนั้นทันที |
| ประวัติ | ทุกรอบบันทึกลง `ad_cron_ticks` (รวมรอบที่ไม่มีอะไรต้องทำ) เก็บ 90 วัน · ดูได้ที่หน้าสถานะ Sync หัวข้อ "ดึงอัตโนมัติ" |

ความลับอยู่ใน Vault ไม่อยู่ในโค้ด — ต้องมี 2 ค่านี้ก่อน job ถึงจะทำงาน (ไม่มี = tick ข้ามเงียบๆ ไม่ error)

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/ads-cron', 'ads_cron_url');
select vault.create_secret('<service_role key>', 'ads_cron_key');
-- แก้ค่าเดิม: select vault.update_secret((select id from vault.secrets where name='ads_cron_key'), '<key ใหม่>');
```

สั่งรอบทดสอบเอง: `select ads_ops.cron_tick();` แล้วดูผลที่ `select status_code, content from net._http_response order by id desc limit 1;`
หยุดชั่วคราว: `select cron.unschedule('ads-sync-tick');` · เปิดใหม่: `select cron.schedule('ads-sync-tick', '7 * * * *', $$select ads_ops.cron_tick();$$);`

## ขอบเขตของขั้นนี้

OAuth · account discovery · สร้าง `ad_connections` · ดึง Insights รายวัน · สลับหน้า ads เป็นยอดจริง (Pilot) พร้อมแล้ว
ตรวจยอด (ข้อ 4): ปุ่ม "ตรวจยอด" ในหน้าสถานะ Sync หรือแท็บ 4 ของหน้าตั้งค่า — เทียบค่าแอด 7/30 วัน (ไม่รวมวันนี้) กับ Meta ระดับบัญชี ผ่านทุกบัญชีแล้วป้ายจะเป็น "ข้อมูลปกติ" · Edge Function `ads-reconcile`
ดึง/ตรวจยอดอัตโนมัติ (ข้อ 7): pg_cron ทุกชั่วโมง + ประวัติทุกรอบใน `ad_cron_ticks`
เปิดให้ทีมเห็นยอดจริง (v0.9): สมาชิกที่ล็อกอินจริงทุกคนเห็น Meta Pilot เป็นค่าเริ่ม · ปุ่มสลับกลับไปข้อมูลจำลองเหลือเฉพาะ team_lead (ใช้ตอนสาธิต) · ดูตัวอย่างโฆษณาจาก Meta ยังเป็นสิทธิ์ team_lead เพราะ Edge Function บังคับไว้
ขั้นถัดไป: ยอดขายจริงจากระบบขาย (Supabase อีกโปรเจกต์) · แจ้งเตือนเมื่อตรวจยอดไม่ผ่านติดกันหลายวัน

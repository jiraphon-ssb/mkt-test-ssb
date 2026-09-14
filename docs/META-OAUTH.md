# Meta Ads OAuth (read-only)

ระบบขอสิทธิ์ `ads_read` เท่านั้น Token อยู่ใน Edge Functions และถูกเข้ารหัส AES-256-GCM ก่อนเก็บฐานข้อมูล Browser จะได้รับเฉพาะสถานะและรายชื่อ Ad Account

## 1. เตรียมฐานข้อมูล

รัน migration ตามลำดับถึง `src/supabase/migrations/0007_meta_oauth.sql` ใน Supabase SQL Editor หรือ migration pipeline ของ environment นั้น

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

## ขอบเขตของขั้นนี้

OAuth และ account discovery พร้อมแล้ว งาน Sync Insights/Creative และการสร้าง `ad_connections` จาก mapping เป็นขั้นถัดไป ต้องผ่านการเทียบยอด 7 และ 30 วันก่อนเปลี่ยนจาก Mock data เป็นข้อมูลจริง

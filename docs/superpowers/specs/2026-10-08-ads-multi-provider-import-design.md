# นำเข้าค่าแอด Google Ads และ ChatGPT ads ด้วยไฟล์ (design)

> 8 ต.ค. 2569 · เจ้าของ: อาร์ต · สถานะ: อนุมัติ design แล้ว รอทำแผน

## ปัญหา

ระบบนับค่าแอดจาก Meta อย่างเดียว แต่ SSB ยิงโฆษณาผ่าน **Google Ads** และ **ChatGPT ads** อยู่ด้วย
ตัวเลขทุกหน้าที่เกี่ยวกับเงิน (งบรวม · %Ads · Pace · ค่าแอดรายแบรนด์) จึง **ต่ำกว่าความจริง** โดยไม่มีอะไรบนจอบอก

เคสที่ทำให้เห็นปัญหา: ไล่หารายการตัดบัตร 2 ใบจากสเตทเมนต์ (4 ก.ย. ฿1,077.88 · 29 ก.ย. ฿603.24)
ตรวจครบ 9 บัญชี Meta แล้วไม่เจอ — เพราะระบบมองเห็นแค่ช่องทางเดียว

## ขอบเขต

**ทำ**
- นำเข้า **ค่าแอดรายวันต่อบัญชี** ของ Google Ads และ ChatGPT ads จากไฟล์ CSV
- ตัวแกะไฟล์ตัวเดียว รองรับหลาย provider ด้วย mapping แยกต่อ provider
- ปลายทางคือ `ad_daily_facts` ตารางเดิม `level='account'` — ไม่สร้างตารางค่าแอดใหม่

**ไม่ทำ**
- ระดับแคมเปญ/โฆษณา · impression · click · conversion · ROAS ต่อแคมเปญ
- Google Ads API (เฟสถัดไป — ท่อนี้ต้องอัปเกรดได้โดยไม่รื้อ)
- creative / preview ของ 2 ช่องทางนี้
- การกระทบยอดบัตรของ Google/OpenAI (หน้าบิลยังเป็นของ Meta เท่านั้น)

**เหตุผลที่เลือกไฟล์ก่อน ไม่ใช่ API**
- OpenAI **ไม่มี** API ให้ดึงยอดค่าโฆษณา (ที่มีคือ OAIQ pixel กับ Conversions API ซึ่งเป็นการส่งข้อมูลเข้า ไม่ใช่ดึงออก) — ไฟล์คือทางเดียว
- Google Ads API ต้องขอ developer token ซึ่งอนุมัติเป็นสัปดาห์และเราคุมไม่ได้ — ถ้าเริ่มจากตรงนั้น งานจะค้างรออนุมัติ
- ตัวนำเข้าไฟล์ไม่ทิ้ง: ใช้กับ ChatGPT ตลอดไป และเป็น fallback ตอน API ล่ม

## การไหลของข้อมูล

```
ไฟล์ CSV จาก Ads Manager
  -> หน้าอัปโหลด (แท็บ Sync)
  -> แกะในเบราว์เซอร์ (pure JS, เทสได้, ไม่ง้อ network)
  -> สรุปให้ยืนยันก่อน: ช่วงวัน / จำนวนวัน / ยอดรวม / ทับของเดิมกี่วัน / วันที่ขาด
  -> ยืนยัน -> RPC ตรวจ team_lead -> upsert ลง ad_daily_facts
  -> ทุกหน้าที่อ่าน ad_daily_facts เห็นเลขใหม่
```

## โครงข้อมูล

### ใช้ของเดิม

`ad_daily_facts` มี unique key `(connection_id, fact_date, level, campaign_id, ad_group_id, ad_id)` อยู่แล้ว
upsert ด้วยคีย์นี้ = **อัปไฟล์ซ้ำกี่รอบยอดก็ไม่บวกซ้ำ** (กติกาเดียวกับที่ Meta ใช้)

### ของใหม่ (migration)

1. **ขยาย provider** — `ad_connections.provider` check constraint เพิ่ม `'openai'`
   (ปัจจุบัน: meta, google, tiktok, shopee)

2. **ตารางใหม่ `ad_import_batches`** — 1 แถว = 1 ไฟล์ที่นำเข้า

   | คอลัมน์ | ใช้ทำอะไร |
   |---|---|
   | `id` uuid pk | |
   | `provider` text, `connection_id` uuid references ad_connections | ไฟล์นี้ของบัญชีไหน |
   | `file_name` text, `file_hash` text **unique** | เตือนเมื่ออัปไฟล์เดิมซ้ำ |
   | `date_from` date, `date_to` date, `row_count` int, `spend_total` numeric(18,4) | สรุปให้ตรวจได้โดยไม่เปิดไฟล์ |
   | `imported_by` text references mkt_profile(id), `created_at` timestamptz | ใครอัป เมื่อไร |

3. **`ad_daily_facts.import_batch_id`** uuid null references `ad_import_batches(id)` on delete set null
   — บอกที่มาของแถว ทำให้ย้อนลบทั้งก้อนได้ และแยกจากแถวที่มาจาก API ได้ในอนาคต

4. **RPC `mkt_ads_import_facts(p_batch jsonb, p_rows jsonb)`** `security definer`
   ตรวจ `mkt_is_team_lead()` เอง แล้ว insert batch + upsert facts ในทรานแซกชันเดียว
   คืนจำนวนแถวใหม่ / แถวที่ทับของเดิม

5. **Grants** — `revoke insert, update, delete, truncate on ad_import_batches from anon, authenticated`
   ตาม pattern ของ `0013_billing_grants.sql` · เขียนได้ทางเดียวคือ RPC
   อ่านได้: policy select สำหรับ authenticated

### การตัดสินใจที่บันทึกไว้

**ไม่เก็บไฟล์ CSV ขึ้น Storage** — เก็บแค่ hash กับสรุป เพราะตัวเลขอยู่ในตารางแล้ว
และไฟล์มี metadata บัญชีโฆษณาที่ไม่จำเป็นต้องเก็บ ถ้าต้องการไฟล์ต้นฉบับให้เก็บใน Drive ตามปกติ

**ต้อง map บัญชี -> แบรนด์ ก่อนอัปครั้งแรก** — `ad_daily_facts.connection_id` บังคับ
ดังนั้นทุก Google/ChatGPT account ต้องมีแถวใน `ad_connections` ก่อน
สร้างแบบ manual (ไม่ผ่าน OAuth) โดยทำเครื่องหมายใน `config.source = 'file'`
**ไม่แตะ constraint `status`** เพื่อไม่กระทบของเดิม
-> มีหน้า "เพิ่มบัญชีแบบไฟล์": เลือกแบรนด์ · Customer ID / ชื่อบัญชี · สกุลเงิน

## ตัวแกะไฟล์ — `src/modules/marketing/ads/importCsv.js`

pure function เหมือน `chargeMatch.js` · รับข้อความไฟล์ + provider · คืน `{ rows, summary, errors }`
ไม่ยุ่งกับ network ไม่ยุ่งกับ DOM

### กติกา (ตั้งใจให้เข้ม เพราะตัวเลขเพี้ยนเงียบๆ แย่กว่าไม่มีข้อมูล)

| สถานการณ์ | ทำอะไร |
|---|---|
| หาคอลัมน์ที่ต้องการไม่เจอ | หยุด + บอกว่าไฟล์มีคอลัมน์อะไร และต้องการอะไร — **ห้ามเดา** |
| มีหัวตารางก่อน header จริง (Google export) | ข้ามจนเจอแถวที่มีคอลัมน์ครบ |
| สกุลเงินในไฟล์ != สกุลเงินของ connection | ปฏิเสธทั้งไฟล์ — ไม่แปลงค่าเงินเอง |
| ช่องค่าแอดว่าง | ข้ามแถว **ไม่ใส่ 0** (กติกาเดิม: ห้ามโชว์ 0 แทนสิ่งที่ไม่รู้) |
| วันเดียวกันซ้ำหลายแถว | รวมยอด แล้วบอกบนจอว่ารวมจากกี่แถว |
| วันที่เป็นอนาคต | ปฏิเสธ |
| ตัวเลขมี `,` หรือสัญลักษณ์สกุลเงิน | ล้างก่อนแปลง |

### ข้อบังคับก่อนเขียน parser

**ห้ามเขียน parser จนกว่าจะเห็นไฟล์ export จริงอย่างน้อย provider ละ 1 ไฟล์**
โปรเจกต์นี้เคยเจ็บมาแล้วตอนท่อเมลใบเสร็จ ที่เกือบเขียนบนรูปแบบที่เดาเอา
(ดู `docs/superpowers/specs/2026-09-22-billing-recon.md`)

ไฟล์ที่ต้องการ: ช่วง 7 วันก็พอ
- Google Ads -> Reports -> CSV แบบมีคอลัมน์ Day + Cost
- ChatGPT Ads Manager -> Export/Download
  **ถ้าไม่มีปุ่ม export เลย ต้องเปลี่ยนเป็นกรอกมือ ซึ่งกระทบ design ส่วนหน้าจอ**

## หน้าจอ

การ์ดใหม่ในแท็บ Sync: "นำเข้าค่าแอดจากไฟล์"

แต่ละบัญชีแบบไฟล์แสดง: ชื่อ · แบรนด์ · ข้อมูลถึงวันไหน · อัปล่าสุดเมื่อไร · ปุ่มเลือกไฟล์
บัญชีที่ไม่ได้อัปเกินเกณฑ์ขึ้นคำเตือน "ไม่ได้อัปมา n วัน"

เลือกไฟล์แล้ว **ยังไม่เขียน** — ขึ้นสรุปก่อน: ช่วงวัน · กี่วัน · ยอดรวม · ทับของเดิมกี่วัน · วันที่ขาดในช่วงนั้น
กดยืนยันถึงเขียน

hash ซ้ำ -> เตือน "ไฟล์นี้เคยอัปเมื่อ ..." แต่ยังอัปซ้ำได้ (ยอดไม่บวกซ้ำอยู่แล้ว)
error แสดงเป็นคำ ไม่ใช่ stack trace

## ผลกระทบกับโค้ดเดิม

### จุดที่กรอง provider ทิ้ง (ต้องแก้ ไม่งั้นข้อมูลเข้า DB แล้วหน้าจอไม่เห็น)

| ไฟล์ | บรรทัด | ปัญหา |
|---|---|---|
| `ads/useAdsData.js` | 39 | `connections.filter(c => c.provider === "meta")` — ตัดทุก provider อื่นตั้งแต่ชั้นโหลด **ตัวบล็อกหลัก** |
| `ads/adsFacts.js` | 38, 72 | default provider เป็น `"meta"` และ `source: "meta"` |
| `ads/adsSourceStrip.js` | 47 | แถวแหล่งข้อมูล hardcode key `meta` |
| `ads/syncOverview.js` | 49, 197 | ชื่อแถวและข้อความไทม์ไลน์ hardcode "Meta" |
| `ads/adsDataHealth.js` | 116 | `creativeEnabled` เช็ค `source.id === "meta"` — ถูกต้องอยู่แล้ว ไม่ต้องแก้ |

### ได้เลขเพิ่มเองโดยไม่ต้องแก้สูตร

งบรวม · %Ads · Pace · ค่าแอดรายแบรนด์ — อ่าน `ad_daily_facts` ตรง

### หน้าบิล & กระทบยอด — ไม่แตะในเฟสนี้

`chargeMatch.js` สร้างบนตรรกะการตัดบัตรของ Meta โดยเฉพาะ (ยอดสะสม · เพดานการตัด · VAT mode)
Google/OpenAI ตัดคนละแบบ

**แต่ต้องเขียนบนจอให้ชัดว่า "หน้านี้แสดงเฉพาะ Meta"** ไม่งั้นคนอ่านจะนึกว่าครบ
ซึ่งคือปัญหาเดียวกับที่ทำให้เสียเวลาไล่หาบิลทั้งสัปดาห์

## เรื่องที่ตั้งใจยังไม่ตัดสิน

ตอนต่อ Google Ads API แล้ว ถ้าวันเดียวกันมีทั้งข้อมูลจากไฟล์และจาก API **ใครชนะ**
ตอนนี้ยังไม่มี API จึงใช้กติกา "อัปทีหลังทับ" และจะกำหนดกติกาจริงตอนเฟส API
(`import_batch_id` รองรับไว้แล้ว — แยกแถวที่มาจากไฟล์ออกจากแถวที่มาจาก API ได้)

## เทส

- **parser**: ไฟล์ปกติ · หัวตารางนำ · คอลัมน์หาย · สกุลเงินผิด · วันซ้ำ · ค่าว่าง · วันอนาคต · ไฟล์เปล่า
- **payload ที่ส่งเข้า RPC**: รูปร่างถูก · hash คงที่สำหรับไฟล์เดียวกัน
- **migration**: ตรวจ SQL ตาม pattern `tests/adsMigrations.test.js`
- **component**: อัปแล้วเห็นสรุป · กดยกเลิกแล้วไม่เขียน · hash ซ้ำแล้วเตือน
- **ของเดิม 188 เคสต้องเขียว**

## ความเสี่ยง

| ความเสี่ยง | รับมือ |
|---|---|
| ChatGPT Ads Manager ไม่มีปุ่ม export | ต้องเปลี่ยนเป็นกรอกมือ — ตรวจให้ชัดก่อนเริ่มเขียน parser |
| รูปแบบ CSV เปลี่ยนภายหลัง | parser หยุดและบอกชื่อคอลัมน์ที่เจอ ไม่เดาต่อ |
| คนลืมอัปไฟล์ | คำเตือน "ไม่ได้อัปมา n วัน" บนการ์ด |
| migration กระทบของเดิม | เพิ่มอย่างเดียว ไม่แก้ของเดิม · เขียน rollback ไว้ในหัวไฟล์ตาม pattern เดิม |

## กติกาของโปรเจกต์ที่ยังบังคับใช้

- แตะ Supabase ต้องขออนุมัติก่อนทุกครั้ง — migration นี้ยังไม่รัน
- ไม่ commit/push จนกว่าอาร์ตสั่ง
- "เสร็จ" ต้องมีหลักฐาน (เทสเขียว / screenshot / output จริง)

---

## เปลี่ยนทิศ — Google Ads ไปทาง API เต็มรูปแบบ (8 ต.ค. เย็น)

**เหตุผลที่เปลี่ยน:** ข้อสมมติเดิมของ spec นี้ผิด

spec ข้างบนเลือกไฟล์ก่อนส่วนหนึ่งเพราะเชื่อว่า Google Ads API ต้องรอ **developer token** อนุมัติเป็นสัปดาห์
ตรวจสอบใหม่แล้วพบว่า **10 ก.ย. 2569 Google ยกเลิก developer token** — ระดับสิทธิ์ผูกกับ **Google Cloud project** แทน
และ **Basic access อนุมัติอัตโนมัติภายในไม่กี่นาที** หลังผ่าน brand verification
คอขวดที่ใช้เป็นเหตุผลหลักหายไป อาร์ตจึงเคาะว่า "Google Ads เชื่อมแบบสุดไปเลย"

**ขอบเขตใหม่ของ Google Ads:** ครบเหมือน Meta — รายวัน ระดับโฆษณา + impression / click / conversion
(ของ ChatGPT ads ยังเป็นไฟล์เหมือนเดิม เพราะ OpenAI ไม่มี API ให้ดึงยอด)

**ส่วนที่ทำไปแล้วไม่เสียเปล่า:** ตารางเดิม · ปลายทาง `ad_daily_facts` เดิม · ท่อนำเข้าไฟล์ยังใช้กับ ChatGPT ads
`importCsv.js` ยังมี mapping ของ `google` ไว้เป็นทางสำรองตอน API ล่ม — ถ้า API นิ่งแล้วค่อยพิจารณาตัดทิ้ง

### โครงฝั่ง Google (เริ่มแล้ว)

- `supabase/functions/_shared/googleAdsReports.js` — pure ทั้งหมด เทสได้โดยไม่ต้องยิง API จริง
  - `gaqlDailyAds({since, until})` · `searchStreamUrl({customerId})` · `normalizeGoogleRow(row)` · `parseSearchStream(batches)`
  - `googleAdsErrorCode(status, payload)` · `isRetryableGoogleError(status)`
  - ล็อกเวอร์ชันไว้ที่ `GOOGLE_ADS_VERSION = "v25"`
  - แถวที่คืนมารูปเดียวกับ `normalizeInsightRow` ของ Meta → ต่อเข้า `ad_daily_facts` ได้ทันที

### ที่ต้องทำต่อ

| ชิ้น | ใครทำ |
|---|---|
| Google Cloud project + เปิด Google Ads API + Basic access + brand verification | อาร์ต |
| OAuth 2.0 Client ID (Web) + ใส่ secret ใน Supabase Edge Function secrets | อาร์ต (ห้ามส่งค่าจริงผ่านแชท) |
| OAuth route ฝั่ง Google (คู่กับ `ads-oauth-*` ของ Meta) | ผม |
| Adapter ใน `ads-sync` + หน้าเชื่อมบัญชี + map บัญชี→แบรนด์ | ผม |

### เรื่องที่ต้องตัดสินก่อนดึงจริง

1. **บัญชีอยู่ใต้ MCC มั้ย** — ถ้าใช่ ทุก request ต้องใส่ header `login-customer-id`
2. **conversion ไหนนับเป็น Lead** — ตอนนี้ `normalizeGoogleRow` ใส่ `metrics.conversions` ทั้งก้อนลง `leads`
   และตั้ง `attributed_conversions = null` ไว้ เพราะยังไม่รู้ว่าอันไหนคือการซื้อ **ห้ามเดา**
   ถ้าต้องแยกชนิด ต้องเพิ่ม `segments.conversion_action` ใน GAQL
3. **timezone ของบัญชี** — รายงาน Google ยึด timezone ของบัญชี ถ้าไม่ใช่ Asia/Bangkok ยอดรายวันจะเหลื่อมกับ Meta

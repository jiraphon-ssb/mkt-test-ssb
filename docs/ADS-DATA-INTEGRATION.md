# Ads data integration

## เป้าหมาย

หน้า Ads ต้องตอบได้ว่าเงินถูกใช้ที่ไหน ได้ผลธุรกิจเท่าไร ข้อมูลใหม่แค่ไหน และตัวเลขทุกตัวมาจากระบบใด โดยไม่รวมยอด attribution ของแพลตฟอร์มกับยอดขายจริงโดยไม่ติดป้ายกำกับ

## ลำดับเชื่อมต่อ

1. **Meta Ads** — แหล่งค่าแอดหลักในช่วงแรก เชื่อมบัญชีต่อแบรนด์และดึงรายวันระดับ account, campaign, ad set และ ad
2. **CRM / Sale** — นำ Lead, มัดจำ, ออเดอร์ และยอดขายจริงมาเป็นฐานคำนวณ ROAS ธุรกิจ
3. **Google Ads** — ดึงรายงานด้วย GAQL และ map conversion action ที่ทีมยืนยัน
4. **TikTok Ads** — ใช้ integrated report สำหรับชุดเล็ก และ async report สำหรับ backfill หรือรายงานขนาดใหญ่
5. **Shopee** — เชื่อม Orders/GMV ก่อน ส่วน Shopee Ads เปิดเมื่อบัญชีและสิทธิ์ API รองรับ พร้อม CSV fallback

## โครงข้อมูล

### `ad_connections`

- `provider`, `external_account_id`, `brand_id`
- `account_name`, `currency`, `timezone`
- `status`, `last_success_at`, `last_error_code`
- OAuth token เก็บแบบเข้ารหัสฝั่ง server เท่านั้น ห้ามส่ง token กลับมาที่ browser

### `ad_daily_facts`

- คีย์: `provider + account + date + campaign + ad_group + ad`
- ค่า: `spend`, `impressions`, `reach`, `clicks`, `leads`, `attributed_conversions`, `attributed_value`
- เก็บ `source_updated_at`, `ingested_at`, `currency`, `timezone`, `attribution_window`
- upsert ด้วยคีย์ต้นทางเพื่อให้รันซ้ำได้โดยยอดไม่บวกซ้ำ

### `business_daily_facts`

- คีย์: `brand + date + order_id`
- ค่า: `lead`, `deposit`, `order`, `net_revenue`, `refund`, `cancelled`
- แหล่งหลักคือ CRM, POS หรือ Marketplace Orders

### `ads_targets` และ `ads_rules`

- เป้าต่อแบรนด์และเดือน: ยอดขาย, งบ, ROAS ขั้นต่ำ, %Ads สูงสุด, CPL สูงสุด
- กฎกลาง: pace tolerance, overspend limit, low ROAS window, stale threshold, missing-data threshold
- ทุกการแก้ไขเก็บผู้แก้ เวลา และค่าก่อน/หลัง

## นิยามกลาง

| KPI | สูตรหรือแหล่งหลัก | หมายเหตุ |
|---|---|---|
| ค่าแอด | `sum(ad_daily_facts.spend)` | แปลงสกุลเงินก่อนรวม |
| ยอดขาย | `sum(business_daily_facts.net_revenue)` | หักยกเลิกและคืนเงิน |
| ROAS ธุรกิจ | ยอดขายจริง ÷ ค่าแอด | KPI หลักของหน้า Overview |
| ROAS Attribution | attributed value ÷ ค่าแอด | แสดงชื่อแยกและ attribution window |
| %Ads | ค่าแอด ÷ ยอดขายจริง | ยอดขายเป็นศูนย์ให้แสดง `—` |
| CPL | ค่าแอด ÷ Lead ที่ผ่านนิยามกลาง | ห้ามรวม messaging start กับ qualified lead |
| Pace งบ | ใช้จริง ÷ งบ เทียบกับวันผ่านไป ÷ วันในเดือน | ใช้ timezone ของบัญชี |

## งานดึงข้อมูล

- Incremental sync ทุก 1 ชั่วโมงสำหรับ 7 วันล่าสุด เพื่อรองรับข้อมูล conversion ที่เปลี่ยนย้อนหลัง
- Daily reconciliation หลังเที่ยงคืนตาม timezone ของบัญชี
- Backfill 90 วันเมื่อเชื่อมบัญชีครั้งแรก โดยแบ่งช่วงและ retry แบบ exponential backoff
- เก็บ raw response แบบจำกัดอายุสำหรับ audit และ debugging แต่หน้าเว็บอ่านจาก normalized facts เท่านั้น
- แสดง `last_success_at`, data freshness และช่องว่างของวันที่บน UI เสมอ

## กฎคุณภาพข้อมูล

- ผลรวมราย campaign ต้องเท่ากับ account total ภายใน tolerance ที่กำหนด
- ค่า spend ติดลบหรือสกุลเงินไม่ตรงต้องเข้า quarantine
- วันที่ไม่มีแถวไม่ถือเป็นศูนย์จนกว่าจะยืนยันว่า sync สำเร็จ
- Conversion ที่ยังไม่มี mapping ไม่รวมใน KPI หลักและแสดงในคิวให้ผู้ดูแลจัดประเภท
- การเปลี่ยน attribution window ต้องขึ้น revision ใหม่ ห้ามนำค่าคนละหน้าต่างมาเปรียบเทียบตรง ๆ

## Data Health และด่านเปิดใช้

หน้าเว็บอ่านสถานะจากหลักฐานของ backend เท่านั้น และห้ามอนุมานว่าเชื่อมสำเร็จจากการมี Account ID โดย mapping ของแต่ละบัญชีรองรับฟิลด์ต่อไปนี้:

- `connectionId`, `oauthStatus` — ยืนยัน OAuth ที่สร้างโดย backend
- `syncStatus`, `lastSuccessAt`, `lastErrorCode`, `missingDays` หรือ `coverageStatus` — ใช้แยกกำลังดึง, ปกติ, ล่าช้า, ช่วงวันที่ขาด และผิดพลาด
- `reconciliation.windows.7d` และ `reconciliation.windows.30d` — เก็บ `localSpend` กับ `remoteSpend` จากรอบตรวจเดียวกัน

เปิดใช้ข้อมูลจริงได้เมื่อบัญชีที่เปิดใช้งานทุกบัญชีผ่านครบทุกข้อ:

1. mapping ถูกต้องและ OAuth ยังใช้งานได้
2. sync สำเร็จล่าสุดไม่เกิน freshness threshold
3. ยอดค่าแอด 7 วันและ 30 วันต่างจากต้นทางไม่เกิน reconciliation tolerance
4. ไม่มี error หรือช่วงวันที่ขาดในบัญชีใด

หากยังไม่มีหลักฐาน ระบบต้องแสดง `ข้อมูลจำลอง`, `รอเชื่อมบัญชี` หรือ `ยังตรวจไม่ได้` และห้ามแสดงสถานะพร้อมใช้

## เอกสารต้นทาง

- [Meta Marketing API — Insights](https://developers.facebook.com/docs/marketing-api/insights)
- [Google Ads API — Reporting](https://developers.google.com/google-ads/api/docs/reporting/overview)
- [Google Ads API — Conversion reporting](https://developers.google.com/google-ads/api/docs/conversions/reporting)
- [TikTok API for Business](https://business-api.tiktok.com/portal/docs)
- [Shopee Open Platform](https://open.shopee.com/)

## ขอบเขตรุ่นแรก

รุ่นแรกเปิด Meta Ads เพียง provider เดียว ใช้ข้อมูลจำลองสำหรับ provider อื่น และยังไม่เปิดการแก้ campaign หรือ budget ที่บัญชีจริง หน้าเว็บอ่านอย่างเดียวจนกว่าจะมี audit log, permission และขั้นยืนยันคำสั่งครบ

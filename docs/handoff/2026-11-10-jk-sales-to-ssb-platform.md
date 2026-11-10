งานให้ SSB PLATFORM: ดึงยอดขาย JUNTAKARN (JK) จาก TMK Operation ผ่าน pipeline (10 พ.ย. 2569)

ส่งมาจากแชทของ ssb-content-pipeline (pipeline) · อาร์ตเคาะข้อตกลงแล้ว รายละเอียดเต็มอยู่ใน `ssb-content-pipeline/docs/ADS-DATA-INTEGRATION.md` หัวข้อ "ข้อตกลงกับ SSB PLATFORM: ยอดขาย JUNTAKARN"

## เป้าหมาย
การ์ดแอด JUNTAKARN ใน LINE ตอนนี้มีแค่ค่าแอด ทำให้ ROAS ขึ้น 0.0 (PLAN.md ข้อ 61) ต้องเพิ่มยอดขาย คนทัก และออเดอร์ของ JK เข้ามาด้วย ข้อนี้คือ "ยอดขาย JUNTAKARN: ยังไม่ทำ" ที่ค้างไว้ใน PLAN.md ข้อ 98

## อาร์ตเคาะแล้ว
1. นับเฉพาะออเดอร์ช่อง **Facebook + LINE** ไม่รวม Instagram · Messenger · โทร · TikTok · Shopee · Lazada · หน้าร้าน
2. ยอดลง **วันออเดอร์** (order_date ของ TMK) ไม่ใช่วันโอนงวดแรกแบบ OEM บนหน้าจอต้องมีป้ายบอกว่านิยามต่างจาก OEM
3. ดึงผ่าน **ท่อ ads-sync เดิม** จาก pipeline ใช้ secret ชุดเดิม (PIPELINE_URL · PIPELINE_SERVICE_KEY) ห้ามเรียกระบบ TMK ตรง
4. ค่าแอดของ JK เข้ามาอยู่แล้ว (b_jt → JK) ไม่ต้องแตะ

## แหล่งข้อมูล (pipeline)
อ่านตาราง `business_daily_facts`:

```
business_daily_facts?select=fact_date,inquiries,inquiry_filled,orders,orders_new,gross_revenue,revenue_new,cancelled,cancelled_value,source_updated_at
  &brand_id=eq.b_jt&source=eq.tmk&fact_date=gte.<since>&fact_date=lte.<เมื่อวานตามเวลาไทย>&order=fact_date.asc
```

| คอลัมน์ | ความหมาย |
|---|---|
| fact_date | วันออเดอร์ |
| inquiries · inquiry_filled | คนทักช่อง Facebook + LINE · ถ้า inquiry_filled = false แปลว่าวันนั้นยังไม่ได้กรอก ค่า 0 = ไม่รู้ ให้ขึ้น "—" และไม่นำไปคิดต้นทุนต่อคนทัก |
| orders · orders_new | ออเดอร์ที่ไม่ยกเลิก · ของลูกค้าใหม่ |
| gross_revenue · revenue_new | ยอดขาย (บาท) ที่ไม่รวมออเดอร์ยกเลิก · ของลูกค้าใหม่ |
| cancelled · cancelled_value | ออเดอร์ที่ยกเลิก แยกไว้ ไม่อยู่ในยอดขาย |
| source_updated_at | เวลาที่รอบดึงเขียนแถวนี้ล่าสุด |

กติกาที่ต้องระวัง:
- **อ่านถึงเมื่อวานเท่านั้น** รอบดึงของ pipeline ดึงถึงวันนี้ด้วย แถวของวันนี้ยังไม่ครบวัน
- รอบดึงยอด JK อยู่ใน ads-cron ของ pipeline ช่วง 07:30–08:20 ส่วน ads-sync ของ SSB PLATFORM รัน 08:55 ลำดับเวลาใช้ได้แล้ว
- รอบที่ดึงสำเร็จเขียนครบทุกวัน (วันไม่มีออเดอร์ = 0) รอบที่ล้มไม่เขียนอะไร ถ้าไม่มีแถวของเมื่อวาน หรือ source_updated_at เก่ากว่าเช้าวันนี้ ถือว่าข้อมูลไม่สด ห้ามแสดงเป็นยอด 0
- qualified_leads · leads_new · deposits · deposit_value · cash_received · refunds ของ JK เป็น 0 ที่ใส่ไว้แทนที่ว่าง ระบบ TMK ไม่มีขั้นเหล่านี้ **ห้ามอ่าน** ขั้น Lead ของ JK ต้องขึ้น "—" ไม่ขึ้น 0
- ฝั่ง pipeline ล็อกชื่อและความหมายของคอลัมน์ชุดนี้ด้วยเทส `tests/jkSalesContract.test.js` ถ้าจะเปลี่ยนจะแจ้งก่อน

## งานฝั่ง SSB PLATFORM (ข้อเสนอ ตรวจกับโครงจริงก่อนทำ)
1. SQL ใหม่ (ไฟล์ถัดจาก 0253) สร้างตารางยอดขายรายวันของแบรนด์ที่มาจากระบบนอก เช่น `ext_sales_daily` (day, brand, inquiries, inquiry_filled, orders, orders_new, sales, sales_new, cancelled, cancelled_value, source = 'tmk', source_updated_at, imported_at) · unique (day, brand, source) · ให้สมาชิกทีมขายและแอดมินอ่านได้ ส่วนการเขียนให้ service role เท่านั้น
2. ads-sync: เพิ่มขั้นดึงยอด JK ต่อจากค่าแอด แยก try/catch ถ้าขั้นนี้ล้ม ค่าแอดต้องยังบันทึกได้ · ใส่ผลไว้ใน response เช่น `jk_sales: { rows, error }` · แปลงข้อมูลด้วยฟังก์ชันล้วนใน map.ts และเขียนเทสใน map_test.ts
3. การ์ดแอดใน LINE (ads_line_summary_payload) กับแท็บแอดในหน้าเป้าหมาย: แบรนด์ JK ใช้ยอดขาย คนทัก และออเดอร์จากตารางใหม่ ทำให้ ROAS กับ %Ads ขึ้นได้ ส่วนขั้น Lead ของ JK ขึ้น "—"
4. ทดสอบ SQL บนฐานจำลองเหมือน t0237 · อัปเดตคู่มือกับ What's New ตามกติกา Docs-as-code

## ต้องถามอาร์ตก่อนลงมือ 2 ข้อ (ฝั่ง pipeline แนะนำไว้แบบนี้)
- ยอดรวม "ทั้งกลุ่ม" ของการ์ดแอดจะรวมยอดขาย JK ไหม → แนะนำให้รวม เพราะค่าแอด JK ถูกรวมในยอดทั้งกลุ่มอยู่แล้ว ถ้าไม่รวมยอดขาย ROAS ทั้งกลุ่มจะต่ำกว่าจริง
- ยอด JK จะขึ้นที่ไหน → แนะนำแค่การ์ดแอดใน LINE กับแท็บแอดในหน้าเป้าหมายก่อน อย่าเพิ่งแตะ sale_dashboard_facts เพราะเป็นสูตรกลางของ OEM กระทบทุกแบรนด์

## สถานะข้อมูลตอนนี้
- ข้อมูลใน pipeline ตอนนี้ยังเป็นฐาน **Facebook ช่องเดียว** (ข้อตกลงเดิมเมื่อ 21 ก.ย.) ตัวเลขจะเป็น Facebook + LINE ก็ต่อเมื่ออาร์ตรัน SQL ฝั่ง TMK (`TMK Operation/supabase/migrations/20261110-jk-facebook-line.sql`) แล้วดึงย้อนหลังฝั่ง pipeline เสร็จ
- ชื่อคอลัมน์ไม่เปลี่ยน SSB PLATFORM เริ่มสร้างท่อได้เลยไม่ต้องรอ แต่ห้ามเอาตัวเลขไปเทียบกับรายงาน TMK จนกว่าจะดึงย้อนหลังเสร็จ

## กติกา (จาก CLAUDE.md ของอาร์ต)
- ห้าม commit / push / merge เอง ทำเสร็จแล้วรายงานว่าพร้อม commit แล้วรอคำสั่ง
- แตะ Supabase หรือ Vercel อะไรก็ตาม แม้แค่อ่าน ต้องบอกก่อนว่าจะทำอะไร กระทบอะไร มีทางเลือกอะไร แล้วรอคำตอบ · SQL อาร์ตเป็นคนรันเอง
- ห้ามขอหรือพิมพ์ PIPELINE_SERVICE_KEY ในแชท
- รหัสแบรนด์: JK = JUNTAKARN (b_jt) ไม่ใช่ JK Design (JD · b_jk)
- จะบอกว่า "เสร็จ" ต้องมีหลักฐาน (เทสผ่าน · ผลรันจริง)

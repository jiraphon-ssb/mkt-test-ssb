-- รายการตัดบัตรจริงจาก Meta (29 ก.ย. — อาร์ตสั่ง "เริ่มทำได้เลย" หลังทดสอบ /act/activities ใน Graph API Explorer ผ่าน)
-- ads-cron ดึงเหตุการณ์ ad_account_billing_* ทุกเช้าแล้ว upsert ลง ad_billing_charges ด้วย onConflict (external_account_id, reference)
-- reference = transaction_id ของ Meta (หรือ ชนิด:เวลา ถ้าไม่มี) → ดึงซ้อนย้อนหลังกี่รอบก็ไม่เกิดแถวซ้ำ
-- unique index ต้องไม่ใช่ partial (ON CONFLICT ต้องตรงคอลัมน์) · reference ว่าง (แถวจากช่องทางอื่นในอนาคต) ซ้ำกันได้ตามปกติของ NULL
-- ตารางยังว่าง (ยังไม่เคยมีช่องนำเข้า) จึงสร้าง index ได้ทันที ไม่ชนข้อมูลเดิม · RLS/สิทธิ์เดิมไม่เปลี่ยน (อ่าน = team_lead · เขียน = service role)
-- ย้อนกลับ: drop index if exists public.ad_billing_charges_account_reference_key; drop index if exists public.ad_billing_charges_charge_date_idx;
create unique index if not exists ad_billing_charges_account_reference_key
  on public.ad_billing_charges (external_account_id, reference);
-- หน้าบิลอ่านตามช่วงวันที่ตัด (apiClient.billingCharges: charge_date >= from and < before)
create index if not exists ad_billing_charges_charge_date_idx
  on public.ad_billing_charges (charge_date);

-- 0013 — ปิดสิทธิ์เขียนตารางบิลให้แน่นตาม pattern 0010 (B2 · 22 ก.ย. 69)
-- ที่ตรวจเจอบนฐานจริง: 0011 revoke แค่ update, delete → anon/authenticated ยังเหลือ INSERT + TRUNCATE
-- และอีกสองตารางไม่ได้ revoke อะไรเลย (ได้สิทธิ์เต็มตามค่าเริ่มต้นของ schema public)
--
-- ทำไมสำคัญทั้งที่มี RLS แล้ว: **TRUNCATE ไม่อยู่ใต้ RLS** — policy คุมแค่ select/insert/update/delete
-- เท่านั้น ดังนั้นคำประกาศว่า ad_billing_reviews เป็น "append-only ระดับ DB" ยังไม่จริงจนกว่าจะปิดตรงนี้
-- (วันนี้ยังใช้ไม่ได้จริงเพราะ PostgREST ไม่เปิด endpoint TRUNCATE แต่โครงต้องตรงกับที่ประกาศ)
--
-- ยังอ่านได้เหมือนเดิม (RLS select ของ team_lead คุมอยู่) · การเขียนทั้งหมดผ่านทางที่ตั้งใจเท่านั้น:
--   ad_account_snapshots / ad_billing_charges → service role ของ Edge Function
--   ad_billing_reviews                        → RPC mkt_billing_review_add (security definer ตรวจ team_lead เอง)
-- rollback: grant insert, update, delete, truncate on <table> to anon, authenticated;

revoke insert, update, delete, truncate on public.ad_account_snapshots from anon, authenticated;
revoke insert, update, delete, truncate on public.ad_billing_reviews   from anon, authenticated;
revoke insert, update, delete, truncate on public.ad_billing_charges   from anon, authenticated;

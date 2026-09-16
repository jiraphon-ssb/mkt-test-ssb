-- ปิดสิทธิ์เขียนของ anon/authenticated บนตารางเนื้อหาเก่า (mkt_*) — พบจากการตรวจ 16 ก.ย. 2569
--
-- ปัญหา: baseline สร้าง policy "<table>_open ... for all to anon, authenticated using (true)"
--        ไว้ตั้งแต่ตอนเป็นเดโมไม่ล็อกอิน บวกกับ GRANT ระดับตารางที่ให้ anon ทำได้ถึง DELETE/TRUNCATE
--        repo เป็น public และ anon key อยู่ในไฟล์ JS ที่เสิร์ฟให้ทุกคนอยู่แล้ว → ใครก็ลบ mkt_brand ได้
--        ซึ่งจะทำให้หน้า ads ทั้งระบบพัง (ชื่อ/สีแบรนด์หายไป)
--
-- แนวทาง: แอปตอนนี้อ่าน mkt_* ผ่าน RPC mkt_load_state() (security invoker, ให้เฉพาะ authenticated)
--        และ AuthContext อ่าน mkt_profile ตรงเพื่อดูสิทธิ์ → เหลือ SELECT ให้ authenticated เท่านั้น
--        ส่วนการเขียนไปผ่าน mkt_save_state() (wrapper ที่ตรวจสิทธิ์แล้วใน 0007) ซึ่งเป็น security definer
--        จึงไม่ต้องพึ่ง GRANT ของผู้เรียก · anon ไม่ต้องเข้าถึงอะไรเลย
--
-- ถอนกลับ: grant กลับคืนได้ด้วยคำสั่งเดียวต่อาราง (เก็บ policy *_open ไว้ตามเดิม ไม่ได้ลบ)
do $$
declare t text;
begin
  foreach t in array array[
    'mkt_profile','mkt_brand','mkt_channel','mkt_card','mkt_channel_run',
    'mkt_status_history','mkt_review_action','mkt_card_note',
    'mkt_attachment','mkt_reference_link','mkt_option_list'
  ] loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;

-- mkt_settings ถูกปิดไปแล้วใน 0009 (เหลือ select ให้ authenticated) — ยืนยันซ้ำให้ idempotent
revoke insert, update, delete, truncate on public.mkt_settings from anon, authenticated;
revoke select on public.mkt_settings from anon;

-- storage: baseline เปิด bucket mkt-files ให้ anon ทำได้ทุกอย่าง — เหลืออ่าน/เขียนเฉพาะผู้ล็อกอิน
drop policy if exists mkt_files_open on storage.objects;
create policy mkt_files_rw on storage.objects
  for all to authenticated
  using (bucket_id = 'mkt-files') with check (bucket_id = 'mkt-files');

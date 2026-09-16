-- ปิด bucket mkt-files ไม่ให้อ่านผ่าน URL สาธารณะ
--
-- baseline สร้าง bucket นี้เป็น public = true ตั้งแต่ต้น แปลว่าใครก็ตามที่รู้ path
-- อ่านไฟล์ได้ตรงๆ ผ่าน /storage/v1/object/public/mkt-files/... โดยไม่ผ่าน RLS เลย
-- (migration 20260916180000 ปิดสิทธิ์ผ่าน API ไว้แล้ว แต่เส้นทาง public ข้ามไปได้)
--
-- ผลหลังรัน: ต้องอ่านผ่าน createSignedUrl() หรือ session ที่ล็อกอินเท่านั้น
-- โค้ดในแอปนี้ไม่มีจุดไหนเรียก bucket นี้ (ตรวจด้วย grep: ไม่มี getPublicUrl/storage.from('mkt-files'))
-- ย้อนกลับ: update storage.buckets set public = true where id = 'mkt-files';

update storage.buckets set public = false where id = 'mkt-files';

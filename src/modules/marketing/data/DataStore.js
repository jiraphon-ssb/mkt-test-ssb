/* ============================================================
 DataStore — seam ข้อมูลของโมดูล · UI เรียกผ่าน `store` ตัวนี้เท่านั้น
 ห้าม import localStore.js หรือแตะ localStorage ตรงๆ จากที่อื่น

 สัญญาที่ implementation ต้องมี (เดโม = LocalStore · ของจริง = SupabaseStore):
   load()        → AppData          อ่านทั้งก้อน (เดโมอ่าน sync ได้ · ของจริงจะเป็น async)
   save(data)    → void             เขียนทั้งก้อน
   reset()       → AppData          ล้างกลับเป็น seed
   export()      → string           JSON สำรองข้อมูล
   import(json)  → AppData          กู้คืนจาก JSON

 วันย้าย Supabase: เขียน supabaseStore.js ที่มี 5 เมธอดนี้ แล้วสลับบรรทัดล่าง
 บรรทัดเดียว — ไม่ต้องแตะ UI แม้แต่ไฟล์เดียว (ดู INTEGRATION.md หัวข้อ seam ข้อมูล)
 ============================================================ */
export { store } from "./localStore.js";

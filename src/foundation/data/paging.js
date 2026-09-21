/* PostgREST ตัด 1,000 แถว/คำขอ — เดิมอ่านทีละหน้าเรียงต่อกัน (Overview: 17 หน้า ≈ 7 วิ = 83% ของเวลาโหลด)
   ทางแก้ 21 ก.ย. ค่ำ: หน้าแรกขอ count:'exact' มาด้วย แล้วยิงหน้าที่เหลือพร้อมกันทั้งหมดด้วย offset จากนี่ */

/** offset ของหน้าที่เหลือหลังหน้าแรก — count เพี้ยน/หาย = [] (ผู้เรียกจะได้แค่หน้าแรก ไม่พัง) */
export function pageOffsets(total, pageSize) {
  if (!Number.isFinite(total) || total <= pageSize) return [];
  const out = [];
  for (let offset = pageSize; offset < total; offset += pageSize) out.push(offset);
  return out;
}

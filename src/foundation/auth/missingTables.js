/* ตารางของแพลตฟอร์มที่บางโปรเจกต์ไม่มี (เช่นโปรเจกต์ ads ไม่มี user_role · sale_user_role)
   รู้ครั้งแรกแล้วจำไว้ในแท็บนี้ — ไม่ยิง 404 ซ้ำทุกครั้งที่ session โหลด · แท็บใหม่เช็กใหม่ (เผื่อเพิ่มตารางทีหลัง) */
import { isMissingTable } from "./buildUser.js";

const KEY = (table) => `ssb.missingTable.${table}`;
const known = (table) => { try { return window.sessionStorage.getItem(KEY(table)) === "1"; } catch { return false; } };
const remember = (table) => { try { window.sessionStorage.setItem(KEY(table), "1"); } catch { /* storage ถูกปิด — ยิงซ้ำได้ ไม่พัง */ } };

// session โหลดพร้อมกันหลายจังหวะ (initial + auth event) — ตัวที่ตามมาระหว่างตัวแรกยังไม่ตอบ รอผลตัวแรกก่อน
const inflight = new Map();

export async function queryUnlessMissing(table, run) {
  if (known(table)) return { data: [], error: null };
  if (inflight.has(table)) {
    await inflight.get(table).catch(() => {});
    if (known(table)) return { data: [], error: null };
    return run();   // ตารางมีจริง — ยิง query ของตัวเอง (ไม่แชร์ผลข้ามผู้เรียก)
  }
  const pending = Promise.resolve(run());
  inflight.set(table, pending);
  try {
    const result = await pending;
    if (result?.error && isMissingTable(result.error)) remember(table);
    return result;
  } finally {
    inflight.delete(table);
  }
}

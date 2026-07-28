/* ============================================================
 localStorage implementation ของ DataStore
 ============================================================ */
import { buildSeed, DATA_VERSION } from "./seed.js";
const KEY = "ssb-content-pipeline";
export class LocalStore {
  load() {
    const raw = localStorage.getItem(KEY);
    if (!raw)
      return this.reset();
    try {
      const data = JSON.parse(raw);
      if (data.version !== DATA_VERSION)
        return this.reset();
      /* กันข้อมูลที่ค้างจากรุ่นก่อนหน้า/ไฟล์กู้คืนที่ไม่ครบ — ขาดคีย์ไหนเติมจาก seed
         ไม่งั้นหน้าที่อ่านคีย์นั้นจะพังทั้งหน้า (เคยเกิดกับ channels) */
      return withDefaults(data);
    }
    catch {
      return this.reset();
    }
  }
  save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
  reset() {
    const seed = buildSeed();
    this.save(seed);
    return seed;
  }
  export() {
    return JSON.stringify(this.load(), null, 2);
  }
  import(json) {
    const data = JSON.parse(json);
    const filled = withDefaults(data);
    this.save(filled);
    return filled;
  }
}
/** เติมคีย์ที่ขาดจาก seed — ไม่แตะข้อมูลที่มีอยู่แล้ว */
function withDefaults(data) {
  const seed = buildSeed();
  const out = { ...data };
  for (const key of Object.keys(seed)) {
    if (out[key] == null || (Array.isArray(seed[key]) && !Array.isArray(out[key])))
      out[key] = seed[key];
  }
  return out;
}

export const store = new LocalStore();

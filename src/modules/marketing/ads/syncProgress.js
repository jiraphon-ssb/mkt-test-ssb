/* ไทม์ไลน์ของรอบดึงข้อมูลที่ผู้ใช้กดเอง (pure · เทสใน tests/syncProgress.test.js)
   ปุ่มเดียว "ดึงข้อมูลทั้งหมด" ทำหลายขั้นต่อกัน — ต้องเห็นว่าอยู่ขั้นไหน ขั้นไหนผ่าน ขั้นไหนล้ม และได้เท่าไหร่
   กติกา: ขั้นที่ล้มไม่หยุดไทม์ไลน์ (ขั้นถัดไปยังทำต่อ) · ล้มแล้วต้องบอกเหตุผลที่ขั้นนั้น ไม่ใช่ toast แล้วหาย */
export const STEP_LABEL = {
  facts: "ค่าแอด Meta",
  creatives: "Creative Meta",
  sales: "ยอดขายทุกแบรนด์",
};
export const STEP_SUB = {
  facts: "เติมช่วงวันที่ขาด + 3 วันล่าสุด",
  creatives: "รูปและข้อความโฆษณาของบัญชีที่ดึงสำเร็จ",
  sales: "ระบบขายพี่ทัช (TD · JD · TA) และระบบ TMK (JUNTAKARN)",
};
const STATE_LABEL = { waiting: "รอคิว", running: "กำลังทำ", done: "เสร็จ", failed: "ไม่สำเร็จ", skipped: "ข้าม" };
const ENDED = ["done", "failed", "skipped"];
const TONE = { waiting: "muted", running: "run", done: "ok", failed: "bad", skipped: "muted" };

/** เริ่มรอบใหม่ — keys = ขั้นที่รอบนี้จะทำ (เรียงตามลำดับที่ทำจริง) */
export function newRun(keys = [], { kind = "all" } = {}) {
  return { kind, keys: (keys ?? []).filter((key) => STEP_LABEL[key]), items: {} };
}

/** อัปเดตขั้นหนึ่ง — คืน object ใหม่เสมอ (ใช้กับ setState ได้ตรงๆ) · ขั้นที่ไม่ได้อยู่ในรอบนี้ไม่มีผล */
export function setStep(run, key, state, detail = null) {
  if (!run?.keys?.includes(key) || !STATE_LABEL[state]) return run;
  return { ...run, items: { ...run.items, [key]: { state, detail: detail ?? null } } };
}

/** แถวสำหรับวาดไทม์ไลน์ — ขั้นที่ยังไม่ถึง = รอคิว (ไม่ใช่ว่าไม่มี) */
export function stepRows(run) {
  if (!run?.keys?.length) return [];
  return run.keys.map((key, index) => {
    const item = run.items?.[key] ?? {};
    const state = STATE_LABEL[item.state] ? item.state : "waiting";
    return {
      key, index, step: index + 1, label: STEP_LABEL[key], sub: STEP_SUB[key],
      state, stateLabel: STATE_LABEL[state], tone: TONE[state], detail: item.detail ?? null,
      last: index === run.keys.length - 1,
    };
  });
}

/** รอบนี้จบทุกขั้นแล้วหรือยัง (ล้มก็นับว่าจบ) */
export const runEnded = (run) => {
  const rows = stepRows(run);
  return rows.length > 0 && rows.every((row) => ENDED.includes(row.state));
};

/** สรุปหัวไทม์ไลน์ — ข้อความเดียวที่บอกว่ารอบนี้เป็นอย่างไร */
export function runHeadline(run) {
  const rows = stepRows(run);
  if (!rows.length) return null;
  const failed = rows.filter((row) => row.state === "failed");
  if (!runEnded(run)) {
    const now = rows.find((row) => row.state === "running");
    const at = now ? now.step : rows.filter((row) => ENDED.includes(row.state)).length + 1;
    return { state: failed.length ? "bad" : "run", text: `กำลังดึงข้อมูล ขั้นที่ ${Math.min(at, rows.length)}/${rows.length}` };
  }
  if (failed.length) return { state: "bad", text: `ดึงเสร็จ แต่ไม่สำเร็จ ${failed.length}/${rows.length} ขั้น — ${failed.map((row) => row.label).join(" · ")}` };
  return { state: "ok", text: `ดึงครบทั้ง ${rows.length} ขั้นแล้ว` };
}

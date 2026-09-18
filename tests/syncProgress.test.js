/* ไทม์ไลน์รอบดึงข้อมูล — ปุ่มเดียวทำหลายขั้น ต้องอ่านออกว่าอยู่ขั้นไหนและขั้นไหนล้ม */
import { describe, expect, it } from "vitest";
import { newRun, runEnded, runHeadline, setStep, stepRows } from "../src/modules/marketing/ads/syncProgress.js";

const all = () => newRun(["facts", "creatives", "sales"]);

describe("newRun / setStep", () => {
  it("ขั้นที่ยังไม่ถึง = รอคิว (ไม่ใช่หายไป)", () => {
    const rows = stepRows(all());
    expect(rows.map((row) => row.state)).toEqual(["waiting", "waiting", "waiting"]);
    expect(rows.map((row) => row.step)).toEqual([1, 2, 3]);
    expect(rows[0].label).toBe("ค่าแอด Meta");
    expect(rows[2].last).toBe(true);
  });
  it("ทิ้งคีย์ที่ไม่รู้จัก และคืน object ใหม่ทุกครั้ง", () => {
    expect(newRun(["facts", "ไม่มีจริง"]).keys).toEqual(["facts"]);
    const run = all();
    const next = setStep(run, "facts", "running", "2/6 ช่วง");
    expect(next).not.toBe(run);
    expect(stepRows(run)[0].state).toBe("waiting");
    expect(stepRows(next)[0]).toMatchObject({ state: "running", stateLabel: "กำลังทำ", tone: "run", detail: "2/6 ช่วง" });
  });
  it("อัปเดตขั้นที่ไม่ได้อยู่ในรอบนี้ หรือสถานะที่ไม่รู้จัก = ไม่มีผล", () => {
    const run = newRun(["sales"]);
    expect(setStep(run, "facts", "done")).toBe(run);
    expect(setStep(run, "sales", "เสร็จแล้วมั้ง")).toBe(run);
  });
});

describe("runEnded / runHeadline", () => {
  it("รอบว่าง = ไม่มีหัวข้อ ไม่นับว่าจบ", () => {
    expect(stepRows(null)).toEqual([]);
    expect(runEnded(newRun([]))).toBe(false);
    expect(runHeadline(newRun([]))).toBeNull();
  });
  it("กำลังทำ = บอกขั้นที่เท่าไหร่จากทั้งหมด", () => {
    let run = setStep(all(), "facts", "done", "6 ช่วง");
    expect(runHeadline(run)).toEqual({ state: "run", text: "กำลังดึงข้อมูล ขั้นที่ 2/3" });
    run = setStep(run, "creatives", "running", "1/3 บัญชี");
    expect(runHeadline(run).text).toBe("กำลังดึงข้อมูล ขั้นที่ 2/3");
    expect(runEnded(run)).toBe(false);
  });
  it("ทุกขั้นจบและผ่าน = ดึงครบ", () => {
    const run = ["facts", "creatives", "sales"].reduce((acc, key) => setStep(acc, key, "done"), all());
    expect(runEnded(run)).toBe(true);
    expect(runHeadline(run)).toEqual({ state: "ok", text: "ดึงครบทั้ง 3 ขั้นแล้ว" });
  });
  it("มีขั้นล้ม = ขั้นถัดไปยังทำต่อ แล้วสรุปบอกว่าขั้นไหนล้ม", () => {
    let run = setStep(all(), "facts", "failed", "สิทธิ์ Meta หมดอายุ");
    run = setStep(run, "creatives", "skipped");
    expect(runHeadline(run).state).toBe("bad");
    run = setStep(run, "sales", "done", "42 วัน×แบรนด์");
    expect(runEnded(run)).toBe(true);
    expect(runHeadline(run)).toEqual({ state: "bad", text: "ดึงเสร็จ แต่ไม่สำเร็จ 1/3 ขั้น — ค่าแอด Meta" });
  });
  it("ดึงแหล่งเดียวก็มีไทม์ไลน์ของตัวเอง", () => {
    const run = setStep(newRun(["sales"], { kind: "sales" }), "sales", "done", "14 วัน×แบรนด์");
    expect(stepRows(run)).toHaveLength(1);
    expect(runHeadline(run).text).toBe("ดึงครบทั้ง 1 ขั้นแล้ว");
  });
});

/* ปุ่ม "ดึงข้อมูลทั้งหมด" ดึงเป้ามาด้วยในรอบเดียวกัน — ไทม์ไลน์ต้องมีขั้นของเป้า
   ไม่งั้นคนกดไม่รู้ว่าเป้าถูกดึงไปแล้วหรือยัง (เจอจากหน้าจริง 18 ก.ย. 69) */
describe("ขั้นเป้าในไทม์ไลน์", () => {
  it("รอบเต็มมี 4 ขั้น จบด้วยเป้า · ดึงยอดขายอย่างเดียวก็มีขั้นเป้า", () => {
    const full = stepRows(newRun(["facts", "creatives", "sales", "goals"]));
    expect(full.map((row) => row.label)).toEqual(["ค่าแอด Meta", "Creative Meta", "ยอดขายทุกแบรนด์", "เป้าเดือนนี้"]);
    expect(full[3].sub).toContain("ระบบ TMK");
    const salesOnly = stepRows(newRun(["sales", "goals"], { kind: "sales" }));
    expect(salesOnly.map((row) => row.key)).toEqual(["sales", "goals"]);
  });
  it("ยอดเข้าแต่เป้าล้ม = ขั้นยอดเสร็จ ขั้นเป้าไม่สำเร็จ และสรุปบอกว่าขั้นไหนล้ม", () => {
    let run = setStep(newRun(["facts", "creatives", "sales", "goals"]), "facts", "done");
    run = setStep(run, "creatives", "done");
    run = setStep(run, "sales", "done", "42 วัน×แบรนด์");
    run = setStep(run, "goals", "failed", "คีย์ที่ตั้งไว้เรียกฟังก์ชันเป้าของระบบ TMK ไม่ได้");
    expect(runEnded(run)).toBe(true);
    expect(runHeadline(run)).toEqual({ state: "bad", text: "ดึงเสร็จ แต่ไม่สำเร็จ 1/4 ขั้น — เป้าเดือนนี้" });
  });
});

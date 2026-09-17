// @vitest-environment jsdom
/* ตารางของแพลตฟอร์มที่โปรเจกต์ ads ไม่มี (user_role · sale_user_role) — รู้ครั้งแรกแล้วไม่ยิง 404 ซ้ำทั้งแท็บ */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryUnlessMissing } from "../src/foundation/auth/missingTables.js";

beforeEach(() => { window.sessionStorage.clear(); });

describe("queryUnlessMissing", () => {
  it("ตารางไม่มี = คืนผลเดิมครั้งแรก แล้วครั้งต่อไปคืน data ว่างโดยไม่ยิง query", async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }));
    const first = await queryUnlessMissing("user_role", run);
    expect(first.error.code).toBe("PGRST205");
    const second = await queryUnlessMissing("user_role", run);
    expect(second).toEqual({ data: [], error: null });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("error อื่น (เน็ตสะดุด) ไม่จำ · ตารางมีอยู่ = ยิงทุกครั้งตามปกติ", async () => {
    const flaky = vi.fn(async () => ({ data: null, error: { code: "08006", message: "connection" } }));
    await queryUnlessMissing("user_role", flaky);
    await queryUnlessMissing("user_role", flaky);
    expect(flaky).toHaveBeenCalledTimes(2);
    const ok = vi.fn(async () => ({ data: [{ role: "x" }], error: null }));
    expect((await queryUnlessMissing("sale_user_role", ok)).data).toEqual([{ role: "x" }]);
  });
  it("เรียกพร้อมกันหลายครั้งตอน session โหลด (3 จังหวะ) = ยิงจริงครั้งเดียว", async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }));
    await Promise.all([queryUnlessMissing("user_role", run), queryUnlessMissing("user_role", run), queryUnlessMissing("user_role", run)]);
    expect(run).toHaveBeenCalledTimes(1);
  });
});


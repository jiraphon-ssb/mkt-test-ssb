// @vitest-environment jsdom
/* หน้าสถานะ Sync — สองแผงที่เป็น "หลักฐาน" ว่าระบบยังดึงข้อมูลอยู่จริง
   แผงเหล่านี้คือที่แรกที่คนเปิดดูเวลาข้อมูลดูผิด ถ้ามันอ่านผิดเองจะพาไปแก้ผิดจุด
   ป้อนข้อมูลดิบรูปเดียวกับที่มาจากฐานข้อมูล แล้วผ่าน normalize ตัวจริง */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CronPanel, RunTable } from "../src/modules/marketing/ads/SyncStatusView.jsx";
import { normalizeCronTicks, normalizeSyncRuns } from "../src/modules/marketing/ads/adsDataHealth.js";

afterEach(cleanup);

const tick = (over = {}) => ({
  id: over.id ?? "t1", source: "pg_cron", status: "success",
  started_at: "2026-09-16T09:07:00.000Z", finished_at: "2026-09-16T09:07:28.000Z",
  planned: 4, synced: 4, reconciled: 0, failed: 0, rows_written: 507, sync_every_hours: 6, error_code: null,
  ...over,
});
const showCron = (ticks, everyHours = 6) =>
  render(<CronPanel ticks={normalizeCronTicks(ticks)} everyHours={everyHours} />);

describe("CronPanel — ประวัติการดึงอัตโนมัติ", () => {
  it("แสดงรอบล่าสุดพร้อมจำนวนก้อน แถวที่เขียน และเวลาที่ใช้", () => {
    const { container } = showCron([tick()]);
    const row = container.querySelectorAll(".sy-tick-row")[1];   // แถวแรกคือหัวตาราง
    expect(within(row).getByText("4 ก้อน")).toBeTruthy();
    expect(within(row).getByText("507 แถว")).toBeTruthy();
    expect(within(row).getByText("28 วิ")).toBeTruthy();
    expect(within(row).getByText("สำเร็จ")).toBeTruthy();
  });

  it("รอบที่ไม่มีอะไรต้องทำ ต้องอ่านออกว่า 'ไม่มีอะไรต้องทำ' ไม่ใช่ดูเหมือนระบบเงียบ", () => {
    const { container } = showCron([tick({ planned: 0, synced: 0, rows_written: 0 })]);
    const row = container.querySelectorAll(".sy-tick-row")[1];
    expect(within(row).getByText("ไม่มีอะไรต้องทำ")).toBeTruthy();
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);   // ดึง/ตรวจยอด/แถว = — ไม่ใช่ 0
  });

  it("รอบที่พังบอกทั้งสถานะและรหัสความผิดพลาด (เอาไปเทียบ RUNBOOK ได้)", () => {
    const { container } = showCron([tick({ status: "failed", error_code: "CRON_LOAD_FAILED", synced: 0, rows_written: 0 })]);
    expect(within(container.querySelectorAll(".sy-tick-row")[1]).getByText("ไม่สำเร็จ · CRON_LOAD_FAILED")).toBeTruthy();
  });

  it("สั่งเองกับอัตโนมัติแยกออกจากกัน", () => {
    const { container } = showCron([tick({ id: "t2", source: "manual" })]);
    expect(within(container.querySelectorAll(".sy-tick-row")[1]).getByText("สั่งเอง")).toBeTruthy();
  });

  it("ยังไม่เคยมีรอบ = บอกว่าจะขึ้นเมื่อไร ไม่ปล่อยพื้นที่ว่าง", () => {
    showCron([]);
    expect(screen.getByText("ยังไม่มีรอบอัตโนมัติ")).toBeTruthy();
    expect(screen.getByText("ประวัติจะขึ้นหลังตัวตั้งเวลาทำงานรอบแรก")).toBeTruthy();
  });

  it("บอกความถี่ที่ตั้งไว้จริง และขึ้น — เมื่อยังไม่รู้ค่า", () => {
    const withHours = showCron([tick()], 6);
    expect(screen.getByText("6 ชั่วโมง")).toBeTruthy();
    withHours.unmount();
    showCron([tick()], null);
    expect(within(screen.getByText("ดึงซ้ำทุก").closest("div")).getByText("—")).toBeTruthy();
  });

  it("เก็บแค่ 12 รอบล่าสุดบนหน้าจอ ไม่ยาวจนหาของไม่เจอ", () => {
    const ticks = Array.from({ length: 20 }, (_, i) => tick({ id: `t${i}`, started_at: `2026-09-16T${String(i).padStart(2, "0")}:07:00.000Z` }));
    const { container } = showCron(ticks);
    expect(container.querySelectorAll(".sy-tick-row").length).toBe(13);   // หัวตาราง + 12 แถว
  });
});

describe("RunTable — ประวัติการ Sync รายบัญชี", () => {
  const run = (over = {}) => ({
    id: over.id ?? "r1", connection_id: "c1", mode: "incremental", status: "success",
    started_at: "2026-09-16T09:07:00.000Z", finished_at: "2026-09-16T09:07:20.000Z",
    rows_written: 1234, error_code: null, triggered_by: null, ...over,
  });
  const accounts = [{ connectionId: "c1", brand: "TEAMDEE", provider: "meta" }];
  const showRuns = (runs) => render(
    <MemoryRouter><RunTable runs={normalizeSyncRuns(runs)} accounts={accounts} /></MemoryRouter>,
  );

  it("แปลรหัสบัญชีเป็นชื่อแบรนด์ที่คนอ่านออก", () => {
    const { container } = showRuns([run()]);
    expect(within(container.querySelectorAll(".sy-run-row")[1]).getByText("TEAMDEE · meta")).toBeTruthy();
  });

  it("บัญชีที่ไม่รู้จักไม่หายไปเงียบ — ขึ้นรหัสหรือบอกว่าไม่ทราบบัญชี", () => {
    const { container } = showRuns([run({ connection_id: "ไม่รู้จัก" })]);
    expect(within(container.querySelectorAll(".sy-run-row")[1]).getByText("ไม่รู้จัก")).toBeTruthy();
  });

  it("แยกโหมดและผู้สั่งให้เห็น และการตรวจยอดไม่แสดงจำนวนแถว (มันไม่เขียนข้อมูล)", () => {
    const { container } = showRuns([run({ mode: "reconcile", rows_written: 0 })]);
    const row = container.querySelectorAll(".sy-run-row")[1];
    expect(within(row).getByText("ตรวจยอด")).toBeTruthy();
    expect(within(row).getByText("อัตโนมัติ")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("run ที่พังแสดงรหัสความผิดพลาดต่อท้ายสถานะ", () => {
    const { container } = showRuns([run({ status: "failed", error_code: "META_RATE_LIMIT", rows_written: 0 })]);
    expect(within(container.querySelectorAll(".sy-run-row")[1]).getByText("failed · META_RATE_LIMIT")).toBeTruthy();
  });

  it("ยังไม่มีประวัติ = อธิบายว่าต้องทำอะไรก่อน", () => {
    showRuns([]);
    expect(screen.getByText("ยังไม่มีประวัติจาก backend")).toBeTruthy();
  });
});

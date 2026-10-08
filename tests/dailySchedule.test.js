import { describe, expect, it } from "vitest";
import {
  DAILY_CRON_EXPRS, DAILY_DEADLINE_LABEL, DAILY_RUN_HOUR, DAILY_RUN_LABEL, DAILY_RUN_MINUTE, DAILY_TICK_OFFSETS, DAILY_WINDOW_LABEL,
  doneToday, nextDailyRunAt, nextDailyTickAt,
} from "../supabase/functions/_shared/dailySchedule.js";

/* 23 ก.ย.: อาร์ตสั่งลดการดึงเหลือวันละครั้ง — ไม่ให้หนักเครื่องฝั่งระบบขาย (SSB/TMK) และ Meta
   28 ก.ย.: ย้ายเป็น 09:00 — แอดเปิด 07:00–07:30 ดึงตี 5 สถานะขึ้น "ปิดอยู่" ทุกแถว
   8 ต.ค.: ย้ายเป็น 07:30 — ข้อมูลทุกแหล่งต้องเสร็จก่อน 08:30 เพราะ 09:00 ต้องส่งรายงาน */
describe("ตารางเวลา — เริ่ม 07:30 เสร็จก่อน 08:30 เวลาไทย", () => {
  const thaiMinutes = DAILY_TICK_OFFSETS.map((offset) => DAILY_RUN_HOUR * 60 + DAILY_RUN_MINUTE + offset);

  it("รอบแรก 07:30 · ป้ายเวลาสำหรับหน้าจออ่านจากค่าเดียวกัน", () => {
    expect([DAILY_RUN_HOUR, DAILY_RUN_MINUTE]).toEqual([7, 30]);
    expect(DAILY_RUN_LABEL).toBe("07:30");
    expect(DAILY_WINDOW_LABEL).toBe("07:40–08:20");
    expect(DAILY_DEADLINE_LABEL).toBe("08:30");
  });

  /* ข้อกำหนดหลักของรอบนี้: รอบสุดท้ายต้องเริ่มและจบก่อนเส้นตาย — Edge Function ถูกตัดที่ 400 วิ */
  it("รอบสุดท้ายบวกเวลาทำงานสูงสุด (400 วิ) ยังจบก่อน 08:30", () => {
    const [h, m] = DAILY_DEADLINE_LABEL.split(":").map(Number);
    const lastEndsAt = thaiMinutes.at(-1) * 60 + 400;      // วินาทีของวัน
    expect(lastEndsAt).toBeLessThan((h * 60 + m) * 60);
  });

  it("ไม่เริ่มก่อน 07:30 — แอดเปิด 07:00–07:30 ดึงก่อนนั้นสถานะโฆษณาเป็น \"ปิดอยู่\"", () => {
    expect(thaiMinutes[0]).toBeGreaterThanOrEqual(7 * 60 + 30);
  });

  it("นิพจน์ pg_cron (UTC) ครอบทุกรอบพอดี — คร่อมชั่วโมงจึงเป็น 2 นิพจน์", () => {
    expect(DAILY_CRON_EXPRS).toEqual(["30,40,50 0 * * *", "0,10,20 1 * * *"]);   // 00:30–01:20 UTC
    const fromCron = DAILY_CRON_EXPRS.flatMap((expr) => {
      const [minutes, hour] = expr.split(" ");
      return minutes.split(",").map((minute) => ((Number(hour) + 7) % 24) * 60 + Number(minute));
    });
    expect(fromCron).toEqual(thaiMinutes);
  });

  it("รอบเก็บตกห่างกันพอที่รอบก่อนจะจบแน่ (Edge Function ถูกตัดที่ 400 วิ)", () => {
    const gaps = DAILY_TICK_OFFSETS.slice(1).map((m, i) => m - DAILY_TICK_OFFSETS[i]);
    expect(Math.min(...gaps) * 60).toBeGreaterThan(400);
  });
});

describe("doneToday — นับวันละครั้งตามวันที่ไทย ไม่ใช่ครบ 24 ชม.", () => {
  it("ทำไปแล้วเช้านี้ = ทำแล้ว · ของเมื่อวาน = ยังไม่ทำ", () => {
    expect(doneToday("2026-09-15T22:05:00.000Z", "2026-09-16")).toBe(true);     // 05:05 ไทย วันที่ 16
    expect(doneToday("2026-09-15T16:59:00.000Z", "2026-09-16")).toBe(false);    // 23:59 ไทย วันที่ 15
  });
  it("เมื่อวานทำตอน 05:47 วันนี้รอบ 05:00 ก็ถึงคิว (เดิมนับ 24 ชม. ต้องรอถึง 05:40)", () => {
    expect(doneToday("2026-09-15T22:47:00.000Z", "2026-09-17")).toBe(false);
  });
  it("รับเวลาเป็น ms / Date ได้เหมือน ISO (หน้าจอส่ง Date.now())", () => {
    expect(doneToday(Date.parse("2026-09-15T22:05:00.000Z"), "2026-09-16")).toBe(true);
    expect(doneToday(new Date("2026-09-15T22:05:00.000Z"), "2026-09-16")).toBe(true);
  });
  it("ไม่เคยทำ / เวลาเสีย / ไม่มีวันนี้ = ยังไม่ทำ (ค้างไว้แย่กว่าดึงเกิน)", () => {
    expect(doneToday(null, "2026-09-16")).toBe(false);
    expect(doneToday("ไม่ใช่เวลา", "2026-09-16")).toBe(false);
    expect(doneToday("2026-09-15T22:05:00.000Z", "")).toBe(false);
  });
});

describe("เวลารอบถัดไป (หน้า Sync)", () => {
  it("ก่อน 07:30 = 07:30 วันนี้ · หลังช่วงเช้า = 07:30 พรุ่งนี้", () => {
    expect(nextDailyRunAt(Date.parse("2026-09-16T20:00:00.000Z"))).toBe("2026-09-17T00:30:00.000Z"); // 17 ก.ย. 03:00 → 07:30
    expect(nextDailyRunAt(Date.parse("2026-09-17T03:00:00.000Z"))).toBe("2026-09-18T00:30:00.000Z"); // 10:00 → พรุ่งนี้
  });
  it("อยู่ในช่วงเก็บตก = รอบเก็บตกถัดไป (ข้ามชั่วโมงได้) · ตรงเวลาพอดีนับเป็นรอบถัดไป", () => {
    expect(nextDailyTickAt(Date.parse("2026-09-17T00:33:00.000Z"))).toBe("2026-09-17T00:40:00.000Z");
    expect(nextDailyTickAt(Date.parse("2026-09-17T00:50:00.000Z"))).toBe("2026-09-17T01:00:00.000Z");   // 07:50 → 08:00
    expect(nextDailyTickAt(Date.parse("2026-09-17T01:25:00.000Z"))).toBe("2026-09-18T00:30:00.000Z");   // หลัง 08:20 → พรุ่งนี้
  });
});

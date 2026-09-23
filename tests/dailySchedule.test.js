import { describe, expect, it } from "vitest";
import {
  DAILY_CRON_EXPR, DAILY_RUN_HOUR, DAILY_TICK_MINUTES, doneToday, nextDailyRunAt, nextDailyTickAt,
} from "../supabase/functions/_shared/dailySchedule.js";

/* 23 ก.ย.: อาร์ตสั่งลดการดึงเหลือวันละครั้งตอนตี 5 — ไม่ให้หนักเครื่องฝั่งระบบขาย (SSB/TMK) และ Meta */
describe("ตารางเวลา — ตี 5 เวลาไทย", () => {
  it("นิพจน์ pg_cron (UTC) ตรงกับตี 5 ไทย และนาทีตรงกับรอบเก็บตก", () => {
    const [minutes, hour] = DAILY_CRON_EXPR.split(" ");
    expect((Number(hour) + 7) % 24).toBe(DAILY_RUN_HOUR);
    expect(minutes.split(",").map(Number)).toEqual(DAILY_TICK_MINUTES);
  });
  it("รอบเก็บตกห่างกันพอที่รอบก่อนจะจบแน่ (Edge Function ถูกตัดที่ 400 วิ)", () => {
    const gaps = DAILY_TICK_MINUTES.slice(1).map((m, i) => m - DAILY_TICK_MINUTES[i]);
    expect(Math.min(...gaps) * 60).toBeGreaterThan(400);
    expect(DAILY_TICK_MINUTES.at(-1)).toBeLessThan(60);          // จบในชั่วโมงเดียว
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
  it("ก่อนตี 5 = ตี 5 วันนี้ · หลังช่วงเช้า = ตี 5 พรุ่งนี้", () => {
    expect(nextDailyRunAt(Date.parse("2026-09-16T20:00:00.000Z"))).toBe("2026-09-16T22:00:00.000Z"); // 03:00 → 05:00
    expect(nextDailyRunAt(Date.parse("2026-09-17T03:00:00.000Z"))).toBe("2026-09-17T22:00:00.000Z"); // 10:00 → พรุ่งนี้
  });
  it("อยู่ในช่วงเก็บตก = รอบเก็บตกถัดไป · ตรงเวลาพอดีนับเป็นรอบถัดไป", () => {
    expect(nextDailyTickAt(Date.parse("2026-09-16T22:03:00.000Z"))).toBe("2026-09-16T22:10:00.000Z");
    expect(nextDailyTickAt(Date.parse("2026-09-16T22:10:00.000Z"))).toBe("2026-09-16T22:20:00.000Z");
    expect(nextDailyTickAt(Date.parse("2026-09-16T22:55:00.000Z"))).toBe("2026-09-17T22:00:00.000Z");
  });
});

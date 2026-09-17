/* ตัวกรองรายงาน (Overview · แคมเปญ · Creative) — logic ล้วน
   1) อยู่ในลิงก์: ส่งลิงก์ให้คนอื่นแล้วเห็นภาพเดียวกัน · ลิงก์ที่มี period = ใช้ลิงก์ล้วน ไม่ปนความจำของคนเปิด
   2) ใช้ร่วมกันทุกหน้า: ตัวกรองกลาง (ช่วงวัน เทียบ ช่องทาง ฐานยอด แบรนด์) จำล่าสุดไว้ในแท็บ เปลี่ยนหน้าแล้วไม่ต้องตั้งใหม่
   ตัวกรองเฉพาะหน้า (สถานะ คำค้น การเรียง ฯลฯ) อยู่ในลิงก์อย่างเดียว ไม่ข้ามหน้า */
import { PERIOD_PRESETS, isoDay, periodRange } from "../adsScope.js";

export const SHARED_FILTER_DEFAULTS = { period: "mtd", compare: "previous", channel: "all", basis: "total", brand: "all" };
const SHARED_KEYS = ["period", "from", "to", "compare", "channel", "basis", "brand"];
const PERIODS = new Set([...PERIOD_PRESETS.map(([key]) => key), "custom"]);
const ALLOWED = { compare: ["previous", "lastMonth"], basis: ["total", "new"] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const REPORT_FILTERS_SESSION_KEY = "ssb.report.filters";

const shownRange = (period, from, to) => {
  const r = periodRange(period, from, to, new Date(`${to ?? ""}T12:00:00`));
  return { from: isoDay(new Date(r.start)), to: isoDay(new Date(new Date(r.end).getTime() - 1)) };
};

/** params = URLSearchParams ของหน้า · session = ตัวกรองกลางล่าสุด (object หรือ null) · page = {key: {default, allowed?}} */
export function readReportFilters(params, session, { today, page = {} } = {}) {
  const fromUrl = params.has("period");
  const source = fromUrl ? Object.fromEntries(params) : { ...(session ?? {}), ...Object.fromEntries(params) };
  const pick = (key, fallback, allowed) => {
    const value = source[key];
    return typeof value === "string" && value !== "" && (!allowed || allowed.includes(value)) ? value : fallback;
  };
  const out = {
    compare: pick("compare", SHARED_FILTER_DEFAULTS.compare, ALLOWED.compare),
    channel: pick("channel", SHARED_FILTER_DEFAULTS.channel),
    basis: pick("basis", SHARED_FILTER_DEFAULTS.basis, ALLOWED.basis),
    brand: pick("brand", SHARED_FILTER_DEFAULTS.brand),
  };
  let period = PERIODS.has(source.period) ? source.period : SHARED_FILTER_DEFAULTS.period;
  const from = source.from, to = source.to;
  if (period === "custom" && !(ISO.test(from ?? "") && ISO.test(to ?? "") && from <= to && to <= today)) period = SHARED_FILTER_DEFAULTS.period;
  // ช่วงสำเร็จรูปคิดใหม่จากวันนี้เสมอ — ลิงก์ "สัปดาห์ก่อน" เปิดวันไหนก็เป็นสัปดาห์ก่อนของวันนั้น
  const range = period === "custom" ? { from, to } : shownRange(period, null, today);
  for (const [key, spec] of Object.entries(page)) {
    // ตัวกรองเฉพาะหน้าไม่รับจากความจำข้ามหน้า
    const value = params.get(key);
    out[key] = value != null && value !== "" && (!spec.allowed || spec.allowed.includes(value)) ? value : spec.default;
  }
  return { period, ...range, ...out };
}

/** ตัวกรองทั้งหมด → URLSearchParams ใหม่ (คงพารามิเตอร์อื่นของหน้า เช่น panel · tab) */
export function writeReportFilters(params, filters, { page = {} } = {}) {
  const next = new URLSearchParams(params);
  for (const key of [...SHARED_KEYS, ...Object.keys(page)]) next.delete(key);
  next.set("period", filters.period);
  if (filters.period === "custom") { next.set("from", filters.from); next.set("to", filters.to); }
  for (const key of ["compare", "channel", "basis", "brand"]) {
    if (filters[key] != null && filters[key] !== SHARED_FILTER_DEFAULTS[key]) next.set(key, filters[key]);
  }
  for (const [key, spec] of Object.entries(page)) {
    if (filters[key] != null && filters[key] !== "" && filters[key] !== spec.default) next.set(key, filters[key]);
  }
  return next;
}

export const sharedFilters = (filters) => Object.fromEntries(SHARED_KEYS.filter((key) => filters[key] !== undefined).map((key) => [key, filters[key]]));

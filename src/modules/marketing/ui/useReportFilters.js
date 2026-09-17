import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { isoDay } from "../adsScope.js";
import { REPORT_FILTERS_SESSION_KEY, readReportFilters, sharedFilters, writeReportFilters } from "./reportFilters.js";

/* จำตัวกรองกลางในแท็บนี้ (sessionStorage) — เปิดแบบส่วนตัว/บล็อกไว้ = ไม่จำ ลิงก์ยังใช้ได้ */
const readSession = () => {
  try { return JSON.parse(sessionStorage.getItem(REPORT_FILTERS_SESSION_KEY) ?? "null"); } catch { return null; }
};
const saveSession = (value) => {
  try { sessionStorage.setItem(REPORT_FILTERS_SESSION_KEY, JSON.stringify(value)); } catch { /* ไม่จำก็ได้ */ }
};

/** [filters, update(patch)] · page = ตัวกรองเฉพาะหน้า {key: {default, allowed?}} — ประกาศเป็นค่าคงที่นอก component */
export function useReportFilters(page = NO_PAGE) {
  const [params, setParams] = useSearchParams();
  const today = isoDay(new Date());
  const query = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => readReportFilters(params, readSession(), { today, page }), [query, today, page]);
  // ลิงก์สะท้อนตัวกรองจริงเสมอ (คัดลอกลิงก์ไปส่งได้ทันที) + จำตัวกรองกลางไว้ให้หน้าอื่น
  useEffect(() => {
    saveSession(sharedFilters(filters));
    const next = writeReportFilters(params, filters, { page });
    if (next.toString() !== query) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
  const update = useCallback((patch) => {
    setParams((prev) => writeReportFilters(prev, { ...readReportFilters(prev, readSession(), { today, page }), ...patch }, { page }), { replace: true });
  }, [setParams, today, page]);
  return [filters, update];
}
const NO_PAGE = {};

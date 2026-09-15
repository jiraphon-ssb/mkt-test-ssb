/* usePagination — หน้า + ขนาดหน้า · กลับหน้า 1 เมื่อตัวกรองเปลี่ยน (resetKey) · จำขนาดหน้าในเครื่อง */
import { useCallback, useMemo, useState } from "react";
import { normalizePageSize, paginate } from "./pagination.js";

function readSize(storageKey, sizes, fallback) {
  try { return normalizePageSize(window.localStorage.getItem(storageKey), sizes, fallback); } catch { return fallback; }
}

export function usePagination(items, { storageKey, sizes, defaultSize, resetKey }) {
  const [pageSize, setPageSizeState] = useState(() => readSize(storageKey, sizes, defaultSize));
  const [state, setState] = useState({ page: 1, resetKey });
  // ตัวกรอง/การเรียงเปลี่ยน → เริ่มหน้า 1 (คำนวณตอน render ไม่ต้องรอ effect จึงไม่กระพริบหน้าเก่า)
  const page = Object.is(state.resetKey, resetKey) ? state.page : 1;
  const info = useMemo(() => paginate(items.length, page, pageSize), [items.length, page, pageSize]);
  const pageItems = useMemo(() => items.slice(info.start, info.end), [items, info.start, info.end]);
  const setPage = useCallback((next) => setState({ page: next, resetKey }), [resetKey]);
  const setPageSize = useCallback((size) => {
    const value = normalizePageSize(size, sizes, defaultSize);
    setPageSizeState(value);
    setState({ page: 1, resetKey });
    try { window.localStorage.setItem(storageKey, String(value)); } catch { /* storage ถูกปิด — จำแค่ในหน่วยความจำ */ }
  }, [sizes, defaultSize, storageKey, resetKey]);
  return { ...info, pageSize, pageItems, setPage, setPageSize };
}

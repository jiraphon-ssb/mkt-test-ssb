/* แบ่งหน้า (pure · เทสใน tests/pagination.test.js) — ใช้ร่วม Creative Library และตารางแคมเปญ */

export function paginate(total, page, pageSize) {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const start = total > 0 ? (current - 1) * size : 0;
  const end = Math.min(total, start + size);
  return { page: current, pages, start, end, from: total > 0 ? start + 1 : 0, to: end, total };
}

/** เลขหน้าที่แสดง ≤7 ช่อง: หน้าแรก/สุดท้ายเสมอ · ช่วงที่ข้ามแทนด้วย "…" */
export function pageNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "…", pages];
  if (page >= pages - 3) return [1, "…", pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, "…", page - 1, page, page + 1, "…", pages];
}

export function normalizePageSize(value, options, fallback) {
  const n = Number(value);
  return options.includes(n) ? n : fallback;
}

/** เลื่อนกลับหัวรายการหลังเปลี่ยนหน้า (เคารพ reduced motion) */
export function scrollToList(ref) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  ref.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
}

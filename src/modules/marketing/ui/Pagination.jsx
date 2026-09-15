/* Pagination — แถบเปลี่ยนหน้า: "แสดง 13–24 จาก 266" · ขนาดหน้า · ก่อนหน้า/เลขหน้า/ถัดไป
   คีย์บอร์ดใช้ได้ทุกปุ่ม · หน้าปัจจุบัน aria-current="page" · มีหน้าเดียวก็ยังโชว์จำนวน (ไม่โชว์ปุ่ม) */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dropdown } from "./Dropdown.jsx";
import { pageNumbers } from "./pagination.js";
import "./pagination.css";

export function Pagination({ pager, sizes, unit = "รายการ", label = "แบ่งหน้า", onChange }) {
  const { page, pages, from, to, total, pageSize, setPage, setPageSize } = pager;
  if (!total) return null;
  const go = (next) => { if (next < 1 || next > pages || next === page) return; setPage(next); onChange?.(next); };
  return <nav className="pg" aria-label={label}>
    <p className="pg-count" aria-live="polite">แสดง <b>{from.toLocaleString("th-TH")}–{to.toLocaleString("th-TH")}</b> จาก <b>{total.toLocaleString("th-TH")}</b> {unit}</p>
    <div className="pg-size"><Dropdown label="ต่อหน้า" ariaLabel="จำนวนต่อหน้า" align="end" options={sizes.map((n) => [String(n), String(n)])} value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); onChange?.(1); }} /></div>
    {pages > 1 && <div className="pg-pages">
      <button type="button" className="pg-step" onClick={() => go(page - 1)} disabled={page === 1} aria-label="หน้าก่อนหน้า"><ChevronLeft size={15} aria-hidden="true" /><span>ก่อนหน้า</span></button>
      <ol>{pageNumbers(page, pages).map((n, i) => n === "…"
        ? <li key={`gap-${i}`} className="pg-gap" aria-hidden="true">…</li>
        : <li key={n}><button type="button" className={n === page ? "is-current" : ""} aria-current={n === page ? "page" : undefined} aria-label={`หน้า ${n}`} onClick={() => go(n)}>{n}</button></li>)}</ol>
      <button type="button" className="pg-step" onClick={() => go(page + 1)} disabled={page === pages} aria-label="หน้าถัดไป"><span>ถัดไป</span><ChevronRight size={15} aria-hidden="true" /></button>
    </div>}
  </nav>;
}

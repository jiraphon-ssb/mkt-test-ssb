/* ============================================================
   mktUi — UI primitives ของโมดูล marketing (สไตล์เดียวกับ oem/ui.jsx)
   inline-style + token object · scoped <style> ใต้ .mkt-root ไม่รั่วออกนอกโมดูล
   สีทุกจุดอ่านจาก var(--color-*) / var(--ssb-*) → สลับ dark/light ได้ทันที
   ห้าม hex ดิบ (ยกเว้นสีแบรนด์ที่มาจากข้อมูล)
   ============================================================ */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* ---------- token ---------- */
export const C = {
  bg: "var(--color-zinc-950)",
  surface: "var(--color-zinc-900)",
  surface2: "var(--color-zinc-800)",
  border: "var(--color-zinc-800)",
  borderStrong: "var(--color-zinc-700)",
  text: "var(--color-zinc-100)",
  muted: "var(--color-zinc-400)",
  dim: "var(--color-zinc-500)",
  faint: "var(--color-zinc-600)",
  accent: "var(--color-emerald-400)",
  accentSolid: "var(--color-emerald-500)",
  accentSoft: "var(--ssb-emerald-soft)",
  amber: "var(--color-amber-400)",
  amberSoft: "var(--ssb-gold-soft)",
  rose: "var(--color-rose-400)",
  roseSoft: "var(--ssb-rose-soft)",
  blue: "var(--ssb-blue)",
  blueSoft: "rgba(111,140,245,0.13)",
  violet: "var(--ssb-violet)",
  violetSoft: "var(--ssb-violet-soft)",
};

export const FONT = "'Noto Sans Thai', ui-sans-serif, system-ui, -apple-system, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

/* สเกลตัวอักษร 6 ระดับ (px — สาย inline style ไม่ใช้ rem เหมือน CSS เดิม) */
/* สเกลเดียวกับ token กลาง (--fs-*) — xxl = --fs-kpi ของแพลตฟอร์ม ห้ามบวมกว่านี้ */
export const FS = { xxs: 10, xs: 11, sm: 12, md: 13, lg: 14, xl: 16, xxl: 22 };
/* ระยะ 4px grid */
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const R = { sm: 8, md: 12, lg: 16, pill: 999 };

/* ---------- style object ที่ spread ซ้ำ ---------- */
export const lbl = { fontSize: FS.xs, color: C.muted, fontWeight: 500, marginBottom: 6, display: "block" };
export const inp = {
  width: "100%", background: "var(--inp-bg, var(--color-zinc-800))",
  border: `1px solid var(--inp-border, ${C.borderStrong})`, borderRadius: R.sm,
  padding: "9px 11px", color: C.text, fontSize: FS.md, fontFamily: FONT,
  outline: "none", boxSizing: "border-box",
};
/* ---------- primitives ---------- */
export const Card = ({ children, style, pad = SP.lg }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, padding: pad, ...style }}>
    {children}
  </div>
);

export const Eyebrow = ({ children, style }) => (
  <div style={{ fontSize: FS.xs, color: C.faint, fontWeight: 600, ...style }}>{children}</div>
);

/** ตัวเลข — mono + tabular ทุกที่ (กติกาแพลตฟอร์ม: ตัวเลขต้องเรียงคอลัมน์ได้) */
export const Num = ({ children, style }) => (
  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>
);

export const Kpi = ({ label, value, sub, tone, big }) => (
  <div style={{ minWidth: 150, flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md, padding: `${SP.md}px ${SP.md}px` }}>
    <div style={{ fontSize: FS.xs, color: C.dim, marginBottom: 5 }}>{label}</div>
    <Num style={{ fontSize: big ? FS.xxl : FS.xl, fontWeight: 600, color: tone ?? C.text, lineHeight: 1.15 }}>
      {value}
    </Num>
    {sub && <div style={{ fontSize: FS.xs, color: C.faint, marginTop: 4 }}>{sub}</div>}
  </div>
);

export const Field = ({ label, required, hint, children, style }) => (
  <div style={{ marginBottom: SP.md, ...style }}>
    {label && (
      <label style={lbl}>
        {label}
        {required && <span style={{ color: C.rose, marginLeft: 3 }}>*</span>}
      </label>
    )}
    {children}
    {hint && <div style={{ fontSize: FS.xs, color: C.faint, marginTop: 5 }}>{hint}</div>}
  </div>
);

/* dropdown ห้ามใช้ <select> ดิบ — ใช้ <MktSelect> จาก mktSelect.jsx ตัวเดียวทั้งระบบ */

/** ชิปกรองแบบเลือกได้หลายค่า/ค่าเดียว */
export const Chip = ({ on, color, children, style, ...rest }) => (
  <button
    style={{
      display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: FONT,
      fontSize: FS.sm, fontWeight: 600, padding: "5px 11px", borderRadius: R.pill,
      background: on ? C.text : C.surface, color: on ? C.bg : C.muted,
      border: `1px solid ${on ? C.text : C.border}`, ...style,
    }}
    {...rest}
  >
    {color && <i style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />}
    {children}
  </button>
);

export const EmptyRow = ({ children, style }) => (
  <div style={{ fontSize: FS.sm, color: C.faint, padding: `${SP.md}px 0`, ...style }}>{children}</div>
);

/** Drawer ขวา / modal กลาง — ตัวเดียวใช้ทุก popup ในโมดูล (ล็อก body scroll + Esc) */
export function Shell({ title, sub, onClose, variant = "drawer", wide, children, footer }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const isDrawer = variant === "drawer";
  return createPortal(
    <div
      className="mkt-root"
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)",
        display: "flex", justifyContent: isDrawer ? "flex-end" : "center",
        alignItems: isDrawer ? "stretch" : "flex-start", padding: isDrawer ? 0 : SP.lg,
        fontFamily: FONT, overflowY: isDrawer ? "hidden" : "auto",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: C.bg, color: C.text, width: isDrawer ? (wide ? 900 : 560) : wide ? 980 : 620,
          maxWidth: "100%", borderRadius: isDrawer ? 0 : R.lg,
          border: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
          maxHeight: isDrawer ? "100%" : "calc(100vh - 32px)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "flex-start", gap: SP.md, padding: `${SP.lg}px ${SP.lg}px ${SP.md}px`,
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {sub && <Eyebrow style={{ marginBottom: 3 }}>{sub}</Eyebrow>}
            <div style={{ fontSize: FS.lg, fontWeight: 700 }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", padding: 4, display: "grid", placeItems: "center" }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: SP.lg }}>{children}</div>

        {footer && (
          <div style={{ padding: `${SP.md}px ${SP.lg}px`, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------- toast (pub/sub ระดับโมดูล แบบ oem/ui.jsx) ---------- */
let toastFn = null;
export const toast = (msg, kind = "") => toastFn?.(msg, kind);

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastFn = (msg, kind) => {
      const id = `${Date.now()}-${Math.round(performance.now())}`;
      setItems((p) => [...p, { id, msg, kind }]);
      window.setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 2600);
    };
    return () => { toastFn = null; };
  }, []);

  if (items.length === 0) return null;
  return createPortal(
    <div style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 80, display: "flex", flexDirection: "column", gap: 8, fontFamily: FONT }}>
      {items.map((t) => (
        <div
          key={t.id}
          style={{
            background: t.kind === "bad" ? C.rose : t.kind === "ok" ? C.accentSolid : C.text,
            color: t.kind ? "#fff" : C.bg,
            fontSize: FS.sm, fontWeight: 600, padding: "10px 16px", borderRadius: R.pill,
            boxShadow: "0 8px 30px rgba(0,0,0,.3)", maxWidth: 420, textAlign: "center",
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>,
    document.body
  );
}

/* ---------- scoped style — hover/scrollbar/media query ที่ inline ทำไม่ได้ ---------- */
export const MktStyles = () => (
  <style>{`
    .mkt-root { font-family: ${FONT}; color: ${C.text}; }
    .mkt-root *, .mkt-root *::before, .mkt-root *::after { box-sizing: border-box; }
    .mkt-root button:disabled { opacity: .5; cursor: not-allowed; }
    .mkt-row:hover { background: ${C.surface2}; }
    .mkt-card-hover { transition: border-color .12s; }
    .mkt-card-hover:hover { border-color: ${C.borderStrong}; }
    .mkt-scroll { scrollbar-width: thin; }
    .mkt-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .mkt-scroll::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 999px; }
    @media (max-width: 760px) { .mkt-hide-sm { display: none !important; } }
    @media (prefers-reduced-motion: reduce) { .mkt-root * { transition: none !important; animation: none !important; } }
  `}</style>
);

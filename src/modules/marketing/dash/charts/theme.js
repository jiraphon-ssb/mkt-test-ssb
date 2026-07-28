/* ============================================================
   ธีมกราฟ — Chart.js (charting lib เดียวของแพลตฟอร์ม · ห้ามใช้ Recharts)
   CSS variable ใช้ใน canvas ตรงๆ ไม่ได้ → resolve เป็นค่าจริงตอน render
   และต้อง "ไม่ cache ข้ามธีม" เพราะสลับ dark/light แล้วค่าเปลี่ยน
   ============================================================ */

/** อ่านค่า CSS custom property ของธีมปัจจุบัน (ไม่ cache — สลับธีมต้องได้ค่าใหม่) */
export function token(name, fallback = "#8B99A8") {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** true เมื่อธีมสว่างกำลังทำงาน */
export function isLightTheme() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("light");
}

export const chartColor = {
  ink: () => token("--color-zinc-100", "#fafafa"),
  inkSoft: () => token("--color-zinc-400", "#a1a1aa"),
  inkFaint: () => token("--color-zinc-600", "#52525b"),
  line: () => token("--color-zinc-800", "#27272a"),
  surface: () => token("--color-zinc-900", "#18181b"),
  surface2: () => token("--color-zinc-800", "#27272a"),
  accent: () => token("--color-emerald-500", "#10b981"),
  accentSoft: () => token("--ssb-emerald-soft", "rgba(52,211,153,.12)"),
  ok: () => token("--color-emerald-400", "#34d399"),
  warn: () => token("--color-amber-400", "#fbbf24"),
  bad: () => token("--color-rose-400", "#fb7185"),
  violet: () => token("--ssb-violet", "#a78bfa"),
  ta: () => token("--ssb-blue", "#6f8cf5"),
};

/* ── สีชุดข้อมูล — ยกจาก ssbgroup-platform (report/Visual.jsx: const C)
   ของเขาตั้งเป็นค่าคงที่ ไม่ผูกธีม เพราะสีเส้น/แท่งต้องคงเดิมเมื่อสลับ dark/light
   (มีแต่ tick/grid/tooltip ที่เปลี่ยนตามธีม) */
export const SERIES = {
  blue: "#6f8cf5", gold: "#fbbf24", orange: "#f59e0b", orange2: "#fb923c",
  green: "#34d399", cogs: "#64748b", red: "#fb7185",
};

/** จานสีสำหรับชุดข้อมูลหลายเส้น — ลำดับเดียวกับที่แพลตฟอร์มใช้ */
export const PALETTE = () => [
  SERIES.blue, SERIES.green, SERIES.orange, SERIES.gold, SERIES.red, SERIES.cogs,
];

/** ความสูงมาตรฐานของกล่องกราฟ */
export const CHART_H = 250;

/* ---------- option พื้นฐาน — เรียบ ไม่มีกรอบ ตัวเลขเล็ก ---------- */
export function baseOpts(extra = {}) {
  const tick = { color: chartColor.inkFaint(), font: { size: 11, family: "'IBM Plex Mono', monospace" } };
  const grid = { color: chartColor.line(), drawTicks: false };
  const { plugins = {}, scales = {}, ...rest } = extra;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,            // ไทล์เยอะ + สลับแท็บบ่อย → ปิดไว้ให้ไม่กระตุก
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },  // legend วาดเองด้านนอก คุมหน้าตาได้กว่า
      tooltip: {
        backgroundColor: chartColor.surface(),
        titleColor: chartColor.ink(),
        bodyColor: chartColor.inkSoft(),
        borderColor: chartColor.line(),
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        boxWidth: 8,
        boxHeight: 8,
        titleFont: { size: 12, family: "'Noto Sans Thai', sans-serif", weight: "600" },
        bodyFont: { size: 12, family: "'Noto Sans Thai', sans-serif" },
      },
      ...plugins,
    },
    scales: {
      x: { grid: { ...grid, display: false }, ticks: tick, border: { display: false } },
      y: { grid, ticks: tick, border: { display: false } },
      ...scales,
    },
    ...rest,
  };
}

/* ---------- format ---------- */
export const fmtInt = (n) => Math.round(n).toLocaleString("th-TH");
export const fmtCompact = (n) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  : String(Math.round(n));
export const fmtPct = (x, digits = 1) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);
export const fmtMoney = (n) => `฿${Math.round(n).toLocaleString("th-TH")}`;
export const fmtDays = (x) => (x == null ? "—" : `${x.toFixed(1)} วัน`);

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

/** ความสูงมาตรฐานของกล่องกราฟ */
export const CHART_H = 250;

/* ---------- option พื้นฐาน — เรียบ ไม่มีกรอบ ตัวเลขเล็ก ---------- */
export function baseOpts(extra = {}) {
  const tick = { color: chartColor.inkFaint(), font: { size: 11, family: "'IBM Plex Mono', 'Noto Sans Thai', monospace" } };
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

/* ---------- format ----------
   null ≠ 0 — ค่าที่ "ไม่รู้" ต้องขึ้น "—" ทุกตัว (เดิม fmtInt/fmtMoney ปัด null เป็น 0
   ทำให้ยอดที่ยังไม่รู้ขึ้น ฿0 ข้างๆ ROAS ที่ขึ้น "—" บนบรรทัดเดียวกัน) */
const unknown = (n) => n == null || (typeof n === "number" && !Number.isFinite(n));
/* กติกาอาร์ต 17 ก.ย. 2569: ค่าที่มีทศนิยมต้องแสดงทศนิยม "ห้ามปัด" — ตัดทิ้งที่ 2 ตำแหน่ง
   ล้างเศษ float ที่ตำแหน่งที่ 6 ก่อน (toFixed(6)) แล้วตัดสตริงเหลือ 2 ตำแหน่ง — ไม่ใช้ Math.trunc(n*100)
   เพราะ float เก็บ 57035.04 เป็น 57035.0399999… และยอดที่บวกหลายพันแถวได้ 326972.3299999999 (จริง = .33)
   ถ้าตัดตรงๆ จะหายไป 1 สตางค์ และคนละหน้าที่บวกคนละลำดับจะขึ้นไม่เท่ากัน (เห็นจริง 17 ก.ย.) */
export function fmtNum(n, digits = 2) {
  if (unknown(n)) return "—";
  const negative = n < 0;
  const [whole, frac = ""] = Math.abs(n).toFixed(6).split(".");
  const cut = frac.slice(0, digits).padEnd(digits, "0");
  const grouped = Number(whole).toLocaleString("th-TH");
  const text = digits > 0 ? `${grouped}.${cut}` : grouped;
  return negative && /[1-9]/.test(text) ? `-${text}` : text;
}
/** จำนวนนับ: จำนวนเต็มไม่มีทศนิยม · มีเศษต้องแสดงเศษ (ไม่ปัด) */
export const fmtInt = (n) => (unknown(n) ? "—" : Number.isInteger(n) ? n.toLocaleString("th-TH") : fmtNum(n, 2));
/** ตัวย่อ (1.2k) — ใช้กับป้ายแกนกราฟเท่านั้น ห้ามใช้แสดงค่า */
export const fmtCompact = (n) =>
  unknown(n) ? "—"
  : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  : String(Math.round(n));
/** เปอร์เซ็นต์ 2 ตำแหน่งแบบตัดทิ้ง (อาร์กิวเมนต์ที่สองคงไว้ให้โค้ดเดิมเรียกได้ แต่ไม่ลดตำแหน่งแล้ว) */
export const fmtPct = (x) => (unknown(x) ? "—" : `${fmtNum(x * 100, 2)}%`);
export const fmtMoney = (n) => (unknown(n) ? "—" : `฿${fmtNum(n, 2)}`);
export const fmtRoas = (x, suffix = "×") => (unknown(x) ? "—" : `${fmtNum(x, 2)}${suffix}`);
export const fmtDays = (x) => (x == null ? "—" : `${fmtNum(x, 2)} วัน`);

/* ---------- กราฟเส้นรายวัน: ค่าตั้งต้นเดียวกันทุกกราฟ ----------
   monotone = โค้งไม่ทะลุค่าจริง (tension ธรรมดาทำให้เส้นแกว่งเกินจุด) · จุดซ่อนเมื่อวันเยอะ · ช่องว่าง = ไม่มีข้อมูล (ไม่ลากข้าม) */
const faded = (color) => (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? `${color}80` : color);
const skipped = (ctx, value) => (ctx.p0.skip || ctx.p1.skip ? value : undefined);
/* openFrom = index ของจุดแรกที่ยังไม่จบวัน (วันนี้) — ช่วงที่ลากเข้าจุดนั้นเป็นเส้นประจาง
   กันกราฟดูเหมือนยอด "ดิ่ง" ทั้งที่แค่ยังเก็บข้อมูลของวันนี้ไม่ครบ */
export const lineSeries = (pointCount, { openFrom = null, ...over } = {}) => {
  const open = (ctx) => openFrom != null && ctx.p1DataIndex >= openFrom;
  const color = (ctx) => faded(ctx.chart.data.datasets[ctx.datasetIndex]?.borderColor);
  return {
    borderWidth: 2, tension: 0, cubicInterpolationMode: "monotone",
    pointRadius: pointCount > 31 ? 0 : 2, pointHoverRadius: 4, pointHitRadius: 10,
    // วันไม่มีข้อมูล: ลากเชื่อมด้วยเส้นประจางๆ (ไม่ทิ้งจุดโดดๆ และไม่หลอกว่ามีค่า) — pattern "skipped segment" ของ Chart.js
    spanGaps: true,
    segment: {
      borderDash: (ctx) => (open(ctx) ? [2, 4] : skipped(ctx, [3, 4])),
      borderColor: (ctx) => (open(ctx) ? color(ctx) : skipped(ctx, color(ctx))),
    },
    ...over,
  };
};
/* ---------- กราฟแท่งรายวัน ----------
   วันที่ไม่มีค่า = ไม่มีแท่ง (null ไม่ใช่ 0) · openFrom = แท่งของวันที่ยังไม่จบ (วันนี้) สีจาง */
export const barSeries = (color, { openFrom = null, ...over } = {}) => ({
  backgroundColor: (ctx) => (openFrom != null && ctx.dataIndex >= openFrom ? faded(color) : color),
  borderWidth: 0, borderRadius: 3, maxBarThickness: 22, categoryPercentage: 0.8, barPercentage: 0.9,
  ...over,
});
/** ป้ายวันบนแกน X / tooltip: "14 ก.ย." (ไม่ใส่ปีให้รก) */
export const dayLabel = (iso) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

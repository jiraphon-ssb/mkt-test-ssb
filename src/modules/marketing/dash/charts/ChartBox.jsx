/* ============================================================
   ChartBox — ห่อ Chart.js ให้เรียกแบบ declarative
   (โครงเดียวกับ platform/src/modules/finance/report/Visual.jsx — ChartBox)
   · สร้าง instance ใน useEffect แล้ว destroy ตอน unmount/ข้อมูลเปลี่ยน
   · rebuild เมื่อสลับธีม เพราะสี grid/tooltip resolve จาก CSS var ตอน render
   · Chart.js responsive เอง — ไม่ต้องวัดความกว้างแบบที่ recharts ต้องทำ
   ============================================================ */

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { useTheme } from "../../../../foundation/context/ThemeContext.jsx";
import { CHART_H } from "./theme.js";

export function ChartBox({ type, data, options, height = CHART_H, ariaLabel, plugins }) {
  const ref = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current) return;
    const ch = new Chart(ref.current, { type, data, options, plugins });
    return () => ch.destroy();
    // key จริงคือเนื้อข้อมูล + ธีม — stringify ครั้งเดียวถูกกว่าปล่อยให้ rebuild ผิดจังหวะ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(data), JSON.stringify(options), plugins, theme]);

  return (
    <div className="dash-chart" style={{ height, position: "relative", minWidth: 0 }}>
      <canvas ref={ref} role="img" aria-label={ariaLabel} />
    </div>
  );
}

/** legend วาดเอง — Chart.js legend ถูกปิดใน baseOpts (คุมหน้าตาได้กว่า) */
export function ChartLegend({ items, style }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginBottom: 8, ...style }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)", color: "var(--ink-soft)" }}>
          <i style={{
            width: 9, height: it.line ? 2 : 9, borderRadius: it.line ? 0 : 2,
            background: it.color, display: "inline-block", flexShrink: 0,
          }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

import React from "react";
import { pctDelta } from "../mktAnalytics.js";
import { fmtCompact, fmtInt, fmtMoney, fmtPct, SERIES } from "./charts/theme.js";
import { Icon } from "../mktIcon.jsx";

export function KpiRow({ cur, prev, rangeLabel }) {
  const tiles = [
    { label: "งานที่วัดผลแล้ว", value: fmtInt(cur.produced), delta: pctDelta(cur.produced, prev.produced), hint: rangeLabel, icon: "check", color: SERIES.green },
    { label: "Reach รวม", value: fmtCompact(cur.reach), delta: pctDelta(cur.reach, prev.reach), icon: "eye", color: SERIES.blue },
    { label: "Engagement Rate", value: fmtPct(cur.er), delta: pctDelta(cur.er, prev.er), hint: "engagement ÷ reach", icon: "sparkles", color: "var(--violet)" },
    { label: "Leads", value: fmtInt(cur.leads), delta: pctDelta(cur.leads, prev.leads), hint: "attribute ได้", icon: "user", color: SERIES.gold },
    { label: "งบ ads", value: cur.spend > 0 ? fmtMoney(cur.spend) : "—", delta: pctDelta(cur.spend, prev.spend), icon: "wallet", color: SERIES.orange },
    { label: "CPL", value: cur.cpl != null ? fmtMoney(cur.cpl) : "—", delta: pctDelta(cur.cpl, prev.cpl), inverse: true, hint: "ยิ่งต่ำยิ่งดี", icon: "target", color: SERIES.red },
  ];

  return (
    <div className="kpi-row">
      {tiles.map((t) => {
        const good = t.delta == null ? null : t.inverse ? t.delta < 0 : t.delta > 0;
        return (
          <div className="kpi-tile" key={t.label}>
            <div className="kpi-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <div className="kpi-label">{t.label}</div>
              <div className="kpi-icon-badge" style={{ color: t.color, background: `color-mix(in srgb, ${t.color} 14%, transparent)`, width: "26px", height: "26px", borderRadius: "8px", display: "grid", placeItems: "center" }}>
                <Icon name={t.icon} size={13} />
              </div>
            </div>
            <div className="kpi-value mono">{t.value}</div>
            <div className="kpi-foot" style={{ marginTop: "6px" }}>
              {t.delta == null ? (
                <span className="kpi-delta none">ไม่มีข้อมูล</span>
              ) : (
                <span className={`kpi-delta ${good ? "up" : "down"}`}>
                  <Icon name="chevron" size={11} />
                  {Math.abs(t.delta * 100).toFixed(0)}%
                </span>
              )}
              {t.hint && <span className="kpi-hint">{t.hint}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

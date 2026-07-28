import React from "react";
import { calculateBrandBenchmark, matchContentDna } from "../mktDna.js";

export function DnaHealthTile({ cards, brandId }) {
  const activeCards = (cards || []).filter((c) => !c.archived && (c.status === "brief" || c.status === "draft"));
  const benchmark = calculateBrandBenchmark(cards || [], brandId);

  if (activeCards.length === 0) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "var(--ink-faint)", fontSize: "var(--fs-sm)" }}>
        ไม่มีงานค้างอยู่ในขั้นตอน Brief/Draft
      </div>
    );
  }

  let totalScore = 0;
  activeCards.forEach((c) => {
    const res = matchContentDna(c, benchmark);
    totalScore += res.score;
  });
  const avgScore = Math.round(totalScore / activeCards.length);

  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-faint)" }}>ดัชนีคุณภาพ DNA ใน Pipeline</div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: avgScore >= 75 ? "var(--ok)" : "var(--warn)" }}>
            {avgScore}% <span style={{ fontSize: "12px", fontWeight: "500", color: "var(--ink)" }}>Match Rate</span>
          </div>
        </div>
        <div style={{ fontSize: "28px" }}>🧬</div>
      </div>

      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-soft)" }}>
        ประเมินจากงาน <strong>{activeCards.length} ใบ</strong> ในสายผลิต (เทียบกับมาตรฐานป้ายเขียว {benchmark.sampleCount} งานเดิม)
      </div>

      <div style={{ height: "6px", background: "var(--surface-2)", borderRadius: "99px", overflow: "hidden" }}>
        <div style={{ width: `${avgScore}%`, height: "100%", background: avgScore >= 75 ? "var(--ok)" : "var(--warn)" }} />
      </div>
    </div>
  );
}

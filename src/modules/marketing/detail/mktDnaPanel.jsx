import React from "react";
import { calculateBrandBenchmark, matchContentDna } from "../mktDna.js";

export function ContentDnaPanel({ card, allCards }) {
  if (!card) return null;

  const benchmark = calculateBrandBenchmark(allCards || [], card.brand_id);
  const result = matchContentDna(card, benchmark);

  const getScoreColor = (score) => {
    if (score >= 80) return "var(--ok)";
    if (score >= 60) return "var(--warn)";
    return "var(--bad)";
  };

  return (
    <div className="dna-panel" style={{
      background: "var(--surface-2)",
      border: "1px solid var(--line)",
      borderRadius: "var(--r)",
      padding: "14px",
      marginTop: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700", fontSize: "var(--fs-sm)" }}>
          <span style={{ color: "var(--accent)" }}>🧬</span>
          <span>Content DNA Matcher</span>
        </div>
        <div style={{
          fontSize: "var(--fs-lg)",
          fontWeight: "800",
          color: getScoreColor(result.score),
          background: "var(--bg)",
          padding: "2px 10px",
          borderRadius: "99px",
          border: `1px solid ${getScoreColor(result.score)}`,
        }}>
          {result.score}%
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: "6px", background: "var(--bg)", borderRadius: "99px", overflow: "hidden", marginBottom: "12px" }}>
        <div style={{
          width: `${result.score}%`,
          height: "100%",
          background: getScoreColor(result.score),
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Metrics Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "var(--fs-xs)", marginBottom: "10px" }}>
        <div style={{ background: "var(--bg)", padding: "6px 8px", borderRadius: "6px" }}>
          <span style={{ color: "var(--ink-faint)" }}>Hook: </span>
          <strong>{result.dna.hookSec}s</strong> <span style={{ opacity: 0.6 }}>(เป้า: ≤{benchmark.idealHookSecMax}s)</span>
        </div>
        <div style={{ background: "var(--bg)", padding: "6px 8px", borderRadius: "6px" }}>
          <span style={{ color: "var(--ink-faint)" }}>Pacing: </span>
          <strong>{result.dna.scenePacing.toFixed(1)}/10s</strong>
        </div>
      </div>

      {/* Advice List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {result.advice.map((item, idx) => {
          let icon = "💡";
          let textColor = "var(--ink)";
          if (item.type === "critical") { icon = "🚨"; textColor = "var(--bad)"; }
          else if (item.type === "warn") { icon = "⚠️"; textColor = "var(--warn)"; }
          else if (item.type === "good") { icon = "✅"; textColor = "var(--ok)"; }

          return (
            <div key={idx} style={{ fontSize: "var(--fs-xs)", color: textColor, display: "flex", alignItems: "flex-start", gap: "6px" }}>
              <span>{icon}</span>
              <span>{item.msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

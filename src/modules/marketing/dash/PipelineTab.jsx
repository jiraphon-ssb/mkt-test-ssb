/* ============================================================
   PipelineTab — มุมมองการไหลของงานและภาระงานในสายผลิต (WIP & Bottlenecks)
   ใช้ข้อมูลจาก status_history, cards, และ mktRules
   ============================================================ */
import React from "react";
import { Panel } from "../mktCard.jsx";
import { CONTENT_STAGES } from "../mktEngine.js";
import { brandOf, profileOf } from "../mktParts.jsx";
import { isIdeaPurgeDue, isStuck, stuckDays } from "../mktRules.js";

export function PipelineTab({ data, scopedCards, onOpenCard }) {
  const activeCards = scopedCards.filter((c) => !c.archived);

  // 1. Per-stage breakdown
  const stageCounts = CONTENT_STAGES.map((s) => ({
    ...s,
    count: activeCards.filter((c) => c.status === s.id).length,
  }));

  // 2. Stuck cards (> 3 days)
  const stuckCards = activeCards
    .filter((c) => isStuck(c, 3, undefined, data.status_history ?? []))
    .sort((a, b) => stuckDays(b, undefined, data.status_history ?? []) - stuckDays(a, undefined, data.status_history ?? []));

  // 3. Owners workload
  const owners = data.profiles.filter((p) => p.active);
  const workloadByOwner = owners.map((p) => {
    const ownerCards = activeCards.filter((c) => c.owner_id === p.id);
    const stages = {};
    CONTENT_STAGES.forEach((s) => {
      stages[s.id] = ownerCards.filter((c) => c.status === s.id).length;
    });
    return {
      profile: p,
      total: ownerCards.length,
      stages,
    };
  }).filter((w) => w.total > 0 || w.profile.role === "content_owner");

  // 4. Idea purge due
  const purgeDue = activeCards.filter((c) => isIdeaPurgeDue(c, data.settings));

  return (
    <div className="pipeline-tab" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* 1. Pipeline Funnel Summary Bar */}
      <Panel title="สัดส่วนงานในสายผลิต (Pipeline Funnel)" info={{ label: "Pipeline Funnel", text: "จำนวนการ์ด active แยกตามขั้นการผลิตจากไอเดียถึงวัดผล" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${CONTENT_STAGES.length}, 1fr)`, gap: "8px" }}>
          {stageCounts.map((s) => (
            <div key={s.id} className="kpi-tile" style={{ borderLeft: `3px solid ${s.color}`, padding: "10px" }}>
              <div className="kpi-label" style={{ fontSize: "var(--fs-xs)", color: s.color, fontWeight: 700 }}>
                {s.name}
              </div>
              <div className="kpi-value mono" style={{ fontSize: "18px" }}>{s.count}</div>
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-faint)" }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="dash-2up">
        {/* 2. Stuck Alert Board */}
        <Panel title={`รายการงานติดค้างขั้นเดิม > 3 วัน (${stuckCards.length})`} tone={stuckCards.length > 0 ? "warn" : "plain"} info={{ label: "งานติดค้าง", text: "งานที่ไม่ได้รับการขยับขั้นมากกว่า 3 วัน เรียงจากค้างนานที่สุด" }}>
          {stuckCards.length === 0 ? (
            <div className="empty-row">🎉 ไม่มีงานติดค้างเกิน 3 วัน ทุกงานไหลลื่นปกติ</div>
          ) : (
            <div className="panel-scroll" style={{ maxHeight: "320px" }}>
              {stuckCards.map((c) => {
                const b = brandOf(data, c.brand_id);
                const owner = profileOf(data, c.owner_id);
                const days = stuckDays(c, undefined, data.status_history ?? []);
                const stage = CONTENT_STAGES.find((s) => s.id === c.status);
                return (
                  <div key={c.id} className="panel-row clickable" onClick={() => onOpenCard(c)}>
                    <div className="pr-main">
                      <div className="pr-title">
                        <span className="dot" style={{ background: b.color }} />
                        {c.title}
                      </div>
                      <div className="pr-sub">
                        <span>{b.name}</span> • <span>ผู้ดูแล: {owner?.display_name || "—"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                      <span className="chip-tone warn">{days} วัน</span>
                      <span style={{ fontSize: "var(--fs-2xs)", color: stage?.color || "var(--ink-faint)" }}>{stage?.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* 4. Idea Backlog Health */}
        <Panel title={`สุขภาพคลังไอเดีย (Idea Backlog)`} tone={purgeDue.length > 0 ? "critical" : "plain"} info={{ label: "คลังไอเดีย", text: "ตรวจสอบไอเดียที่ค้างเกินกำหนดล้าง (Purge Days)" }}>
          <div className="dash-2up" style={{ marginBottom: "12px" }}>
            <div className="kpi-tile">
              <div className="kpi-label">ไอเดียทั้งหมด</div>
              <div className="kpi-value mono">{activeCards.filter((c) => c.status === "idea").length}</div>
            </div>
            <div className="kpi-tile">
              <div className="kpi-label">ใกล้หมดอายุ (&gt;{data.settings?.idea_purge_days || 60}วัน)</div>
              <div className="kpi-value mono" style={{ color: purgeDue.length > 0 ? "var(--bad)" : "var(--ok)" }}>
                {purgeDue.length}
              </div>
            </div>
          </div>
          {purgeDue.length > 0 && (
            <div className="panel-scroll" style={{ maxHeight: "200px" }}>
              {purgeDue.map((c) => (
                <div key={c.id} className="panel-row clickable" onClick={() => onOpenCard(c)}>
                  <div className="pr-main">
                    <div className="pr-title">{c.title}</div>
                    <div className="pr-sub">สร้างเมื่อ: {new Date(c.created_at).toLocaleDateString("th-TH")}</div>
                  </div>
                  <span className="chip-tone critical">ครบกำหนดล้าง</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* 3. Owner Workload Distribution */}
      <Panel title="ภาระงานกระจายตามผู้ดูแล (Owner Workload)" info={{ label: "Workload", text: "ตารางแสดงจำนวนงาน active ของแต่ละคนในแต่ละขั้น" }}>
        <table className="dash-table">
          <thead>
            <tr>
              <th>ผู้ดูแล</th>
              <th>รวม active</th>
              {CONTENT_STAGES.map((s) => (
                <th key={s.id} style={{ color: s.color }}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workloadByOwner.map((w) => (
              <tr key={w.profile.id}>
                <td style={{ fontWeight: 600 }}>{w.profile.display_name}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{w.total}</td>
                {CONTENT_STAGES.map((s) => {
                  const n = w.stages[s.id] || 0;
                  return (
                    <td key={s.id} className="mono" style={{ color: n > 0 ? "var(--ink)" : "var(--ink-faint)" }}>
                      {n > 0 ? n : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/* ============================================================
   AnalyticsTab — วิเคราะห์เจาะลึก 5 มิติ (Brand / Channel / Kind / Owner / SLA)
   แสดงผลรวมทุกมิติในหน้าเดียว ไม่มี sub-tabs
   ============================================================ */
import React from "react";
import { Panel } from "../mktCard.jsx";
import { brandOf, profileOf } from "../mktParts.jsx";
import { computeFirstPassRate, computeReviewSLA, isStuck } from "../mktRules.js";
import { fmtCompact, fmtInt, fmtPct } from "./charts/theme.js";

const KIND_LABEL = {
  single: "ภาพเดี่ยว (Single AW)",
  album: "ชุดภาพ (Album)",
  video: "คลิป (Video)",
};

export function AnalyticsTab({ data, scopedCards, brandRows, channelRows, ownerRows, kindRows }) {
  const sla = computeReviewSLA(data.review_actions, data.settings);
  const owners = data.profiles.filter((p) => p.role === "content_owner");
  const fpStats = computeFirstPassRate(data.cards, data.review_actions, data.settings, owners.map((o) => o.id));

  return (
    <div className="analytics-tab" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* 1. Brand Comparison Table */}
      <Panel title="เปรียบเทียบผลงานราย Brand" info={{ label: "เทียบ Brand", text: "สรุปตัวเลขงานที่วัดผลแล้วแยกตามแบรนด์ เรียงตาม ER และจำนวนงาน" }}>
        {brandRows.length === 0 ? (
          <div className="empty-row">ยังไม่มีงานที่วัดผลแล้วในช่วงนี้</div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>โหมด</th>
                <th>งานวัดผล</th>
                <th>Reach รวม</th>
                <th>Engagement</th>
                <th>ER เฉลี่ย</th>
                <th>Leads</th>
                <th>ป้ายผล (เขียว/เหลือง/แดง)</th>
              </tr>
            </thead>
            <tbody>
              {brandRows.map((r) => {
                const b = brandOf(data, r.key);
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>
                      <span className="dot" style={{ background: b.color }} /> {b.name}
                    </td>
                    <td className="dim">{b.mode || "maintain"}</td>
                    <td className="mono">{fmtInt(r.n)} ชิ้น</td>
                    <td className="mono">{fmtCompact(r.reach)}</td>
                    <td className="mono">{fmtCompact(r.engagement)}</td>
                    <td className="mono" style={{ fontWeight: 700, color: r.er ? "var(--ok)" : "inherit" }}>
                      {fmtPct(r.er)}
                    </td>
                    <td className="mono">{fmtInt(r.leads)}</td>
                    <td>
                      <div className="labels">
                        <span className="lb green" title="เกินค่าเฉลี่ย">{r.labels.green}</span>
                        <span className="lb yellow" title="ตามค่าเฉลี่ย">{r.labels.yellow}</span>
                        <span className="lb red" title="ต่ำกว่าครึ่ง">{r.labels.red}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {/* 2. Channel Performance Matrix */}
      <Panel title="สถิติเจาะรายช่องทาง (Channel Runs)" info={{ label: "ช่องทาง", text: "คำนวณจากตัวเลข mkt_channel_run จริงของแต่ละแพลตฟอร์ม" }}>
        {channelRows.length === 0 ? (
          <div className="empty-row">ยังไม่มีตัวเลขแยกรายช่องทางในช่วงนี้</div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>ช่องทาง</th>
                <th>งานลงช่องนี้</th>
                <th>Reach / Views</th>
                <th>Engagement</th>
                <th>ER เฉลี่ย</th>
                <th>Leads</th>
                <th>ป้ายผล</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((r) => {
                const ch = data.channels?.find((c) => c.id === r.key || c.name === r.key);
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>
                      <span className="dot" style={{ background: ch?.color || "var(--link)" }} /> {ch?.name || r.key}
                    </td>
                    <td className="mono">{fmtInt(r.n)} ครั้ง</td>
                    <td className="mono">{fmtCompact(r.reach)}</td>
                    <td className="mono">{fmtCompact(r.engagement)}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{fmtPct(r.er)}</td>
                    <td className="mono">{fmtInt(r.leads)}</td>
                    <td>
                      <div className="labels">
                        <span className="lb green">{r.labels.green}</span>
                        <span className="lb yellow">{r.labels.yellow}</span>
                        <span className="lb red">{r.labels.red}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {/* 3. Content Format Analyzer */}
      <Panel title="วิเคราะห์ประสิทธิภาพตามชนิดงาน (Format)" info={{ label: "ชนิดงาน", text: "เปรียบเทียบผลตอบรับระหว่างภาพเดี่ยว ชุดภาพ (Album) และคลิปวิดีโอ" }}>
        {kindRows.length === 0 ? (
          <div className="empty-row">ยังไม่มีข้อมูลชนิดงานในช่วงนี้</div>
        ) : (
          <div className="dash-3up" style={{ marginBottom: 0 }}>
            {kindRows.map((r) => (
              <div key={r.key} className="kpi-tile" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div className="kpi-label" style={{ fontWeight: 700, fontSize: "var(--fs-sm)" }}>
                  {KIND_LABEL[r.key] || r.key}
                </div>
                <div className="kpi-value mono">{fmtInt(r.n)} <span style={{ fontSize: "var(--fs-xs)", fontWeight: "normal", color: "var(--ink-soft)" }}>ชิ้นงาน</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-xs)", borderTop: "1px solid var(--line)", paddingTop: "6px", marginTop: "4px" }}>
                  <span>Reach: <strong className="mono">{fmtCompact(r.reach)}</strong></span>
                  <span>ER: <strong className="mono" style={{ color: "var(--ok)" }}>{fmtPct(r.er)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* 4. Owner Performance Matrix */}
      <Panel title="เมทริกซ์ผลงานรายบุคคล (Content Owners)" info={{ label: "รายบุคคล", text: "แสดงจำนวนงาน, ER เฉลี่ย, First Pass Rate และจำนวนงานติดค้างคิว" }}>
        {ownerRows.length === 0 ? (
          <div className="empty-row">ยังไม่มีข้อมูลผลงานรายคนในช่วงนี้</div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>ผู้ดูแล</th>
                <th>ตำแหน่ง</th>
                <th>งานวัดผลแล้ว</th>
                <th>Reach รวม</th>
                <th>ER เฉลี่ย</th>
                <th>First Pass Rate</th>
                <th>งานค้างคิว (&gt;3วัน)</th>
              </tr>
            </thead>
            <tbody>
              {ownerRows.map((r) => {
                const p = profileOf(data, r.key);
                const fp = fpStats.find((s) => s.ownerId === r.key);
                const stuckCount = scopedCards.filter((c) => c.owner_id === r.key && isStuck(c, 3, undefined, data.status_history ?? [])).length;
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>{p?.display_name || r.key}</td>
                    <td className="dim">{p?.role || "content_owner"}</td>
                    <td className="mono">{fmtInt(r.n)} ชิ้น</td>
                    <td className="mono">{fmtCompact(r.reach)}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{fmtPct(r.er)}</td>
                    <td className="mono">{fp?.rate == null ? "—" : `${Math.round(fp.rate * 100)}%`}</td>
                    <td className="mono" style={{ color: stuckCount > 0 ? "var(--bad)" : "var(--ink-faint)" }}>
                      {stuckCount} ชิ้น
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {/* 5. Review SLA Tracker */}
      <Panel title="ตัวติดตามระยะเวลาตรวจ (Review SLA)" info={{ label: "Review SLA", text: "ประเมินความเร็วในการตรวจอนุมัติงานตามข้อกำหนด SLA ของทีม" }}>
        <div className="dash-2up" style={{ marginBottom: 0 }}>
          <div className="kpi-tile">
            <div className="kpi-label">เป้าหมาย SLA การตรวจ</div>
            <div className="kpi-value mono" style={{ color: "var(--accent)" }}>{data.settings?.sla_hours || 24} ชม.</div>
            <div className="kpi-foot">
              <span className="kpi-hint">กำหนดจากหน้าตั้งค่าระบบ</span>
            </div>
          </div>
          <div className="kpi-tile">
            <div className="kpi-label">เวลาตรวจเฉลี่ยรวมทีม</div>
            <div className="kpi-value mono">{sla.avgWaitHours != null ? `${sla.avgWaitHours.toFixed(1)} ชม.` : "—"}</div>
            <div className="kpi-foot">
              <span className={`kpi-delta ${sla.avgWaitHours <= (data.settings?.sla_hours || 24) ? "up" : "down"}`}>
                {sla.avgWaitHours <= (data.settings?.sla_hours || 24) ? "ผ่าน SLA" : "เกิน SLA"}
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

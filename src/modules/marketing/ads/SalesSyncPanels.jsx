/* หน้า Sync — ส่วนระบบขาย · creative · สิทธิ์และคีย์ (ข้อ 2 ของแผน docs/superpowers/plans/2026-09-17-sales-data-rollout.md)
   ตัวแสดงผลล้วน รับข้อมูลที่ SyncStatusView โหลดมาแล้ว · ตรรกะอยู่ใน syncSources.js (มีเทส)
   ทุกสถานะบอกเป็นตัวหนังสือ ไม่ใช้สีอย่างเดียว · ไม่มีข้อมูลต้องบอกว่าเพราะอะไร */
import { Link } from "react-router-dom";
import { CalendarClock, Database, Image as ImageIcon, KeyRound, ListChecks, PlugZap, Radar, RefreshCw, ShoppingBag } from "lucide-react";
import {
  checkVerdictView, coverageMatrix, creativeRunView, goalGaps, inventorySources, pipelineRunView, tokenDaysLeft, SALES_BRAND_IDS,
} from "./syncSources.js";

const when = (value) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const monthLabel = (month) => new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(new Date(`${month}-01T00:00:00Z`));
const dayLabel = (iso) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));
const num = (value) => Number(value ?? 0).toLocaleString("th-TH");
const seconds = (ms) => (ms == null ? "—" : ms < 1000 ? "<1 วิ" : `${Math.round(ms / 1000)} วิ`);

const CELL_TEXT = {
  full: () => "ครบ",
  partial: (cell) => cell.filled != null ? `กรอก ${cell.filled}/${cell.days}` : `มีตั้งแต่ ${dayLabel(cell.since)}`,
  not_filled: () => "ทีมยังไม่กรอก",
  no_data: () => "ยังไม่มีข้อมูล",
  waiting_source: () => "รอเชื่อมแหล่งข้อมูล",
};
const SOURCE_STATE = { has_data: "มีข้อมูล", empty: "ยังไม่มีข้อมูล", callable: "เรียกได้", unreadable: "อ่านไม่ได้" };

/** การ์ดแหล่งข้อมูลธุรกิจ: ระบบขาย · creative · แบรนด์ที่ยังไม่มีแหล่ง */
export function BusinessSourceCards({ salesRun, creativeRuns = [], waitingBrands = [] }) {
  const sales = salesRun ? pipelineRunView(salesRun) : null;
  const creativeLatest = creativeRuns[0] ? pipelineRunView(creativeRuns[0]) : null;
  return <section className="sy-biz" aria-label="แหล่งข้อมูลธุรกิจ">
    <article className={`sy-biz-card ${sales?.tone ?? "muted"}`}>
      <header><ShoppingBag size={15} aria-hidden="true" /><span>ระบบขาย (TD · JD · TA)</span></header>
      <strong>{sales ? sales.statusLabel : "ยังไม่เคยดึง"}</strong>
      <p>{salesRun ? `รอบล่าสุด ${when(salesRun.started_at)} · ${sales.trigger}` : "ยังไม่มีรอบดึงยอดขายที่บันทึกไว้"}</p>
      {salesRun?.range_to && <small>ข้อมูลถึง {dayLabel(salesRun.range_to)}{salesRun.rows_written != null ? ` · เขียน ${num(salesRun.rows_written)} แถว` : ""}</small>}
      {sales?.errorText && <small className="sy-biz-error">{sales.errorText}</small>}
    </article>
    <article className={`sy-biz-card ${creativeLatest?.tone ?? "muted"}`}>
      <header><ImageIcon size={15} aria-hidden="true" /><span>Creative (Meta)</span></header>
      <strong>{creativeLatest ? creativeLatest.statusLabel : "รอรอบถัดไป"}</strong>
      <p>{creativeRuns[0] ? `รอบล่าสุด ${when(creativeRuns[0].started_at)} · ${creativeLatest.trigger}` : "ยังไม่มีรอบที่บันทึก · รีเฟรชอัตโนมัติวันละครั้งต่อบัญชี"}</p>
    </article>
    {waitingBrands.map((brand) => <article key={brand.id} className="sy-biz-card muted">
      <header><PlugZap size={15} aria-hidden="true" /><span>ยอดขาย {brand.name}</span></header>
      <strong>รอเชื่อมแหล่งข้อมูล</strong>
      <p>ยังไม่มีแหล่งยอดขายของแบรนด์นี้ · ค่าแอด Meta ยังดึงตามปกติ</p>
    </article>)}
  </section>;
}

/** ตรวจการเชื่อมต่อ — ผลล่าสุดที่กดในหน้านี้ */
export function SalesCheckResult({ result }) {
  if (!result) return null;
  const view = checkVerdictView(result.verdict);
  return <div className={`sy-check ${view.tone}`} role="status">
    <strong>{view.title}</strong>
    <span>{view.detail}</span>
    {result.facts?.summary && <small>อ่านยอด 7 วันล่าสุดได้ {num(result.facts.summary.rows)} รายการ · คีย์ชนิด {result.key?.kind ?? "—"}</small>}
  </div>;
}

/** เป้าเดือนนี้ต่อแบรนด์: มาจากไหน ขาดช่องไหน */
export function GoalGapList({ brands = [], goals = [] }) {
  const byBrand = new Map(goals.map((goal) => [goal.brand_id, goal]));
  return <div className="sy-goals">
    {brands.map((brand) => {
      if (!SALES_BRAND_IDS.includes(brand.id)) return <div key={brand.id} className="sy-goal"><b>{brand.name}</b><span className="sy-chip muted">รอเชื่อมแหล่งข้อมูล</span></div>;
      const gap = goalGaps(byBrand.get(brand.id) ?? null);
      const source = gap.source === "sale_goal" ? `หน้าเป้าหมาย v${gap.version}` : gap.source === "sale_target" ? "เป้าแบบเก่า" : "ยังไม่ตั้งเป้า";
      return <div key={brand.id} className="sy-goal">
        <b>{brand.name}</b>
        <span className={`sy-chip ${gap.source === "sale_goal" ? "ok" : gap.source === "sale_target" ? "warn" : "bad"}`}>{source}</span>
        <span className="sy-goal-missing">{gap.missing.length ? <>ยังไม่ตั้ง: {gap.missing.join(" · ")}</> : "ครบทุกช่อง"}</span>
      </div>;
    })}
  </div>;
}

/** ตารางความครบรายเดือน × ตัวชี้วัด × แบรนด์ */
export function CoverageTable({ facts = [], brands = [], from, to }) {
  const matrix = coverageMatrix(facts, { brandIds: brands.map((brand) => brand.id), from, to });
  if (!matrix.rows.length) return <div className="sy-empty"><Database size={22} aria-hidden="true" /><strong>ยังไม่มีข้อมูลความครบ</strong><span>จะขึ้นหลังดึงยอดขายรอบแรก</span></div>;
  const names = new Map(brands.map((brand) => [brand.id, brand.name]));
  return <div className="sy-coverage" role="region" aria-label="ความครบของข้อมูลระบบขาย" tabIndex={0}>
    <table>
      <thead><tr><th scope="col">แบรนด์</th><th scope="col">ตัวชี้วัด</th>{matrix.months.map((month) => <th scope="col" key={month}>{monthLabel(month)}</th>)}</tr></thead>
      <tbody>
        {brands.map((brand) => {
          const rows = matrix.rows.filter((row) => row.brandId === brand.id);
          // แบรนด์ที่ยังไม่มีแหล่งยอดขาย: แถวเดียวพอ ไม่ต้องย้ำทุกตัวชี้วัดทุกเดือน
          if (rows.every((row) => row.cells.every((cell) => cell.state === "waiting_source"))) {
            return <tr key={brand.id} className="sy-coverage-brand">
              <th scope="row">{names.get(brand.id) ?? brand.id}</th>
              <td className="sy-coverage-metric">ทุกตัวชี้วัด</td>
              <td colSpan={matrix.months.length}><span className="sy-cell waiting_source">รอเชื่อมแหล่งข้อมูล</span></td>
            </tr>;
          }
          return rows.map((row, index) => <tr key={`${row.brandId}-${row.metric}`} className={index === 0 ? "sy-coverage-brand" : undefined}>
            {index === 0 ? <th scope="row" rowSpan={rows.length}>{names.get(row.brandId) ?? row.brandId}</th> : null}
            <td className="sy-coverage-metric">{row.label}</td>
            {row.cells.map((cell) => <td key={cell.month}><span className={`sy-cell ${cell.state}`}>{CELL_TEXT[cell.state](cell)}</span></td>)}
          </tr>);
        })}
      </tbody>
    </table>
  </div>;
}

/** แหล่งอื่นในระบบขาย จากรอบสำรวจล่าสุด */
export function InventoryList({ run }) {
  const sources = inventorySources(run?.summary);
  if (!run) return <div className="sy-empty"><Radar size={22} aria-hidden="true" /><strong>ยังไม่เคยสำรวจแหล่งข้อมูล</strong><span>ระบบสำรวจเองวันละครั้งพร้อมรอบดึงยอดขาย</span></div>;
  return <div className="sy-inventory">
    <p className="sy-inventory-meta">สำรวจล่าสุด {when(run.started_at)} · {pipelineRunView(run).trigger}</p>
    <ul>{sources.map((source) => <li key={source.key}>
      <span className={`sy-chip ${source.state === "has_data" || source.state === "callable" ? "ok" : source.state === "empty" ? "warn" : "bad"}`}>{SOURCE_STATE[source.state]}</span>
      <b>{source.label}</b>
      <small>{source.detail}</small>
    </li>)}</ul>
  </div>;
}

/** ประวัติรอบดึงยอดขาย / สำรวจแหล่ง */
export function PipelineRunTable({ runs = [], emptyText = "ยังไม่มีรอบที่บันทึกไว้" }) {
  if (!runs.length) return <div className="sy-empty"><ListChecks size={22} aria-hidden="true" /><strong>{emptyText}</strong></div>;
  return <div className="sy-run-table">
    <div className="sy-run-row sy-pipe-row head"><span>เวลา</span><span>งาน</span><span>ผู้สั่ง</span><span>ช่วงวัน</span><span>อ่าน / เขียน</span><span>ใช้เวลา</span><span>ผล</span></div>
    {runs.slice(0, 15).map((run) => {
      const view = pipelineRunView(run);
      return <div className="sy-run-row sy-pipe-row" key={run.id}>
        <span>{when(run.started_at)}</span>
        <span>{run.pipeline === "inventory" ? "สำรวจแหล่ง" : run.pipeline === "creatives" ? "Creative" : "ยอดขาย"}</span>
        <span>{view.trigger}</span>
        <span>{run.range_from ? `${dayLabel(run.range_from)} – ${dayLabel(run.range_to)}` : "—"}</span>
        <span>{run.rows_read == null && run.rows_written == null ? "—" : `${run.rows_read == null ? "—" : num(run.rows_read)} / ${run.rows_written == null ? "—" : num(run.rows_written)}`}</span>
        <span>{seconds(view.durationMs)}</span>
        <span className={`sy-run-${run.status}`}>{view.errorText ? `${view.statusLabel} · ${view.errorText}` : view.statusLabel}</span>
      </div>;
    })}
  </div>;
}

/** ส่วนระบบขายทั้งก้อน */
export function SalesSourcePanel({
  brands = [], facts = [], goals = [], runs = [], inventoryRun = null, from, to,
  canSync = false, busy = null, checkResult = null, onCheck, onSync, onBackfill, onInventory,
}) {
  const salesRuns = runs.filter((run) => run.pipeline === "sales" || run.pipeline === "inventory");
  return <section className="sy-panel sy-sales" aria-labelledby="sy-sales-title">
    <header>
      <div><h2 id="sy-sales-title">ระบบขาย</h2><p>ยอดขาย · funnel · เป้า จากระบบขายของพี่ทัช (อ่านอย่างเดียว) · ดึงเองทุกวันหลัง 9 โมง ย้อน 14 วัน</p></div>
      {canSync && <div className="sy-actions">
        <button type="button" onClick={onCheck} disabled={Boolean(busy)} aria-busy={busy === "check"}><KeyRound size={14} aria-hidden="true" />{busy === "check" ? "กำลังตรวจ…" : "ตรวจการเชื่อมต่อ"}</button>
        <button type="button" onClick={onInventory} disabled={Boolean(busy)} aria-busy={busy === "inventory"}><Radar size={14} aria-hidden="true" />{busy === "inventory" ? "กำลังสำรวจ…" : "สำรวจแหล่ง"}</button>
        <button type="button" onClick={onBackfill} disabled={Boolean(busy)} aria-busy={String(busy ?? "").startsWith("backfill")}><CalendarClock size={14} aria-hidden="true" />{String(busy ?? "").startsWith("backfill") ? busy.replace("backfill:", "กำลังดึงย้อนหลัง ") : "ดึงย้อนหลัง 3 เดือน"}</button>
        <button type="button" className="sy-primary" onClick={onSync} disabled={Boolean(busy)} aria-busy={busy === "sync"}><RefreshCw size={14} className={busy === "sync" ? "spin" : ""} aria-hidden="true" />{busy === "sync" ? "กำลังดึง…" : "ดึงยอดขายตอนนี้"}</button>
      </div>}
    </header>
    <SalesCheckResult result={checkResult} />
    <h3 className="sy-sub">เป้าเดือนนี้</h3>
    <GoalGapList brands={brands} goals={goals} />
    <h3 className="sy-sub">ความครบของข้อมูล</h3>
    <CoverageTable facts={facts} brands={brands} from={from} to={to} />
    <h3 className="sy-sub">แหล่งอื่นในระบบขาย</h3>
    <InventoryList run={inventoryRun} />
    <h3 className="sy-sub">ประวัติรอบ</h3>
    <PipelineRunTable runs={salesRuns} emptyText="ยังไม่มีรอบดึงยอดขาย" />
  </section>;
}

/** Creative: รอบล่าสุดต่อบัญชี */
export function CreativeRunsPanel({ latestByConnection = new Map(), accounts = [] }) {
  const rows = accounts.filter((account) => account.connectionId);
  return <section className="sy-panel" aria-labelledby="sy-creative-title">
    <header><div><h2 id="sy-creative-title">Creative</h2><p>รูปและข้อความโฆษณาจาก Meta · ภาพจริงดึงจากโพสต์ผ่านสิทธิ์เพจ/Business</p></div></header>
    {rows.length ? <div className="sy-run-table">
      <div className="sy-run-row sy-creative-row head"><span>บัญชี</span><span>รีเฟรชล่าสุด</span><span>ชิ้นงาน</span><span>ภาพจริงจากโพสต์</span><span>ภาพจาก hash</span><span>ผล</span></div>
      {rows.map((account) => {
        const run = latestByConnection.get(account.connectionId) ?? null;
        const view = creativeRunView(run);
        const status = run ? pipelineRunView(run) : null;
        return <div className="sy-run-row sy-creative-row" key={account.key}>
          <span>{account.brand} · {account.accountId}</span>
          <span>{run ? when(run.started_at) : "ยังไม่มีรอบที่บันทึก"}</span>
          <span>{view ? num(view.total) : "—"}</span>
          <span>{view?.postMediaPct == null ? "—" : `${Math.round(view.postMediaPct * 100)}%`}</span>
          <span>{view?.hash ?? "—"}</span>
          <span className={run ? `sy-run-${run.status}` : ""}>{!run ? "—" : view.needsReconnect ? "ต้องเชื่อม Meta ใหม่" : view.missingPages ? `${status.statusLabel} · เข้าไม่ถึง ${view.missingPages} เพจ` : status.errorText ? `${status.statusLabel} · ${status.errorText}` : status.statusLabel}</span>
        </div>;
      })}
    </div> : <div className="sy-empty"><ImageIcon size={22} aria-hidden="true" /><strong>ยังไม่มีบัญชีที่เชื่อม</strong></div>}
  </section>;
}

/** สิทธิ์และคีย์ */
export function AccessPanel({ authorizations = [], salesRun = null, now = Date.now() }) {
  const active = authorizations.filter((item) => item?.status === "connected");
  const salesView = salesRun ? pipelineRunView(salesRun) : null;
  return <section className="sy-panel" aria-labelledby="sy-access-title">
    <header><div><h2 id="sy-access-title">สิทธิ์และคีย์</h2><p>หมดอายุหรือขาดสิทธิ์เมื่อไร ข้อมูลจะหยุดเข้า</p></div><Link to="/mkt/ads?panel=settings&tab=sources">จัดการการเชื่อม</Link></header>
    <ul className="sy-access">
      {active.length ? active.map((item) => {
        const days = tokenDaysLeft(item.expires_at, now);
        return <li key={item.id}>
          <span className={`sy-chip ${days == null ? "warn" : days <= 7 ? "bad" : days <= 21 ? "warn" : "ok"}`}>{days == null ? "ไม่รู้วันหมดอายุ" : `เหลือ ${days} วัน`}</span>
          <b>Meta · {item.provider_user_name ?? "บัญชีที่เชื่อม"}</b>
          <small>{days == null
            ? "Meta ไม่ได้ส่งวันหมดอายุมาตอนเชื่อม — ระบบเตือนล่วงหน้าไม่ได้ ถ้าข้อมูลหยุดเข้า ให้กดเชื่อมใหม่"
            : `หมดอายุ ${when(item.expires_at)} · กดเชื่อมใหม่ก่อนถึงกำหนด`}</small>
        </li>;
      }) : <li><span className="sy-chip bad">ยังไม่ได้เชื่อม</span><b>Meta</b><small>เชื่อมในหน้าตั้งค่า › บัญชี</small></li>}
      <li>
        <span className={`sy-chip ${salesView?.tone ?? "muted"}`}>{salesView ? (salesRun.status === "success" || salesRun.status === "partial" ? "ใช้ได้" : "มีปัญหา") : "ยังไม่ได้ใช้"}</span>
        <b>คีย์ระบบขาย (marketing_bridge)</b>
        <small>{salesRun ? `ยืนยันจากรอบดึงล่าสุด ${when(salesRun.started_at)}${salesView.errorText ? ` · ${salesView.errorText}` : ""}` : "กด “ตรวจการเชื่อมต่อ” ในส่วนระบบขาย"}</small>
      </li>
    </ul>
  </section>;
}

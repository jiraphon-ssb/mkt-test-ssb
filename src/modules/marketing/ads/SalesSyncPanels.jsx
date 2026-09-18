/* หน้า Sync — ส่วนรายละเอียดในแท็บ: ยอดขาย · creative · สิทธิ์และคีย์
   ตัวแสดงผลล้วน รับข้อมูลที่ SyncStatusView โหลดมาแล้ว · ตรรกะอยู่ใน syncSources.js (มีเทส)
   ทุกสถานะบอกเป็นตัวหนังสือ ไม่ใช้สีอย่างเดียว · ไม่มีข้อมูลต้องบอกว่าเพราะอะไร */
import { fmtNum, fmtMoney, fmtPct, fmtInt } from "../dash/charts/theme.js";
import { Link } from "react-router-dom";
import { Database, Image as ImageIcon, Radar } from "lucide-react";
import {
  checkVerdictView, coverageMatrix, creativeRunView, goalGaps, inventorySources, pipelineRunView, tokenDaysLeft, GOAL_FIELDS, SALES_BRAND_IDS,
} from "./syncSources.js";

const when = (value) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const monthLabel = (month) => new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(new Date(`${month}-01T00:00:00Z`));
const dayLabel = (iso) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));
const num = (value) => Number(value ?? 0).toLocaleString("th-TH");

const CELL_TEXT = {
  full: () => "ครบ",
  partial: (cell) => cell.filled != null ? `กรอก ${cell.filled}/${cell.days}` : `เริ่ม ${dayLabel(cell.since)}`,
  not_filled: () => "ทีมยังไม่กรอก",
  no_data: (cell) => cell.since ? `เริ่มเก็บ ${dayLabel(cell.since)}` : "ยังไม่มีข้อมูล",
  open: () => "วันนี้ยังไม่ปิด",
  waiting_source: () => "รอเชื่อมแหล่งข้อมูล",
  no_stage: () => "ระบบขายไม่มีขั้นนี้",
};
// สีของช่อง: ต้องมีคนทำอะไร = แดง/เหลือง · ข้อจำกัดของแหล่ง (ยังไม่เริ่มเก็บ) = เทา ไม่ใช่ปัญหา
const cellTone = (cell) => cell.state === "no_data" && cell.since ? "since" : cell.state === "no_stage" ? "since" : cell.state;
const SOURCE_STATE = { has_data: "มีข้อมูล", empty: "ยังไม่มีข้อมูล", callable: "เรียกได้", unreadable: "อ่านไม่ได้" };

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

const GOAL_FORMAT = {
  sales_target: "money", ad_budget: "money", cpl: "money", cac: "money", cpi: "money", roas: "roas", pct_ads_new: "pct",
};
const GOAL_SHORT = { sales_target: "ยอดขาย", sales_new_target: "ยอดใหม่", cpi: "ต่อทัก" };
const goalValue = (key, value) => {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n) || (key === "ad_budget" && n <= 0)) return null;
  const kind = GOAL_FORMAT[key];
  if (kind === "money") return fmtMoney(n);
  if (kind === "roas") return `${fmtNum(n, 2)}×`;
  if (kind === "pct") return fmtPct(n <= 1 ? n : n / 100);
  return fmtInt(n);
};

/** เป้าเดือนนี้: แบรนด์ × ช่องเป้า โชว์ตัวเลขจริง · ช่องที่ยังไม่ตั้ง = — · สรุปช่องที่ขาดไว้บรรทัดเดียว */
export function GoalMatrix({ brands = [], goals = [] }) {
  const byBrand = new Map(goals.map((goal) => [goal.brand_id, goal]));
  const sourceBrands = brands.filter((brand) => SALES_BRAND_IDS.includes(brand.id));
  const gaps = sourceBrands.map((brand) => goalGaps(byBrand.get(brand.id) ?? null));
  const lacking = gaps.filter((gap) => gap.missing.length);
  const missing = GOAL_FIELDS.map(([, label]) => label).filter((label) => lacking.some((gap) => gap.missing.includes(label)));
  return <div className="sy-goal-block">
    {lacking.length > 0 && <p className="sy-goal-summary">{lacking.length === sourceBrands.length ? "ทุกแบรนด์" : `${lacking.length} แบรนด์`}ยังไม่ตั้ง: {missing.join(" · ")} <span>· ทีมขายตั้งที่หน้าเป้าหมายของระบบขาย</span></p>}
    <div className="sy-table-scroll" role="region" aria-label="เป้าเดือนนี้" tabIndex={0}>
      <table className="sy-goal-table">
        <thead>
          <tr className="sy-goal-groups"><th colSpan={2} /><th colSpan={5} scope="colgroup">ยอดและ funnel</th><th colSpan={6} scope="colgroup">งบและประสิทธิภาพโฆษณา</th></tr>
          <tr><th scope="col">แบรนด์</th><th scope="col">ที่มา</th>{GOAL_FIELDS.map(([key, label]) => <th scope="col" key={key}>{GOAL_SHORT[key] ?? label}</th>)}</tr>
        </thead>
        <tbody>
          {brands.map((brand) => {
            if (!SALES_BRAND_IDS.includes(brand.id)) return <tr key={brand.id}><th scope="row">{brand.name}</th><td colSpan={GOAL_FIELDS.length + 1}><span className="sy-chip muted">รอเชื่อมแหล่งข้อมูล</span></td></tr>;
            const goal = byBrand.get(brand.id) ?? null;
            const gap = goalGaps(goal);
            const manualFields = Object.entries(goal?.sources ?? {}).filter(([, from]) => from === "manual").map(([key]) => GOAL_SHORT[key] ?? key);
            /* ที่มาของเป้า 4 แบบ: หน้าเป้าหมายของพี่ทัช · เป้าแบบเก่า · ระบบ TMK (JUNTAKARN) · ตั้งเองในหน้าตั้งค่า */
            const SOURCE_TEXT = { sale_goal: `หน้าเป้าหมาย v${gap.version}`, sale_target: "เป้าแบบเก่า", tmk_month: "ระบบ TMK", manual: "ตั้งค่าเอง" };
            const source = SOURCE_TEXT[gap.source] ?? "ยังไม่ตั้งเป้า";
            return <tr key={brand.id}>
              <th scope="row">{brand.name}</th>
              <td>
                <span className={`sy-chip ${["sale_goal", "tmk_month", "manual"].includes(gap.source) ? "ok" : gap.source === "sale_target" ? "warn" : "bad"}`}>{source}</span>
                {/* แถวหนึ่งมีได้ทั้งค่าจากระบบขายและค่าที่แก้เอง — บอกว่าแก้ไว้กี่ช่อง ไม่งั้นอ่านไม่ออกว่าตัวไหนถูกทับ */}
                {manualFields.length > 0 && gap.source !== "manual"
                  && <span className="sy-chip ok" title={`แก้เอง: ${manualFields.join(" · ")}`}>ตั้งค่าเอง {manualFields.length} ช่อง</span>}
              </td>
              {GOAL_FIELDS.map(([key]) => { const text = goal ? goalValue(key, goal[key]) : null; return <td key={key} className={text ? "num" : "num unset"}>{text ?? <>—<span className="sr-only">ยังไม่ตั้ง</span></>}</td>; })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}

const shortDay = (iso) => Number(iso.slice(8, 10));

/** ความครบของข้อมูล: จัดกลุ่มตามตัวชี้วัด · ทุกแบรนด์สถานะเดียวกัน = ยุบแถวเดียว · หัวคอลัมน์บอกช่วงวันจริง */
export function CoverageTable({ facts = [], brands = [], from, to, today = null }) {
  const sourceBrands = brands.filter((brand) => SALES_BRAND_IDS.includes(brand.id));
  const waiting = brands.filter((brand) => !SALES_BRAND_IDS.includes(brand.id));
  const matrix = coverageMatrix(facts, { brandIds: sourceBrands.map((brand) => brand.id), from, to, today });
  if (!matrix.rows.length) return <div className="sy-empty"><Database size={22} aria-hidden="true" /><strong>ยังไม่มีข้อมูลความครบ</strong><span>จะขึ้นหลังดึงยอดขายรอบแรก</span></div>;
  const names = new Map(brands.map((brand) => [brand.id, brand.name]));
  const metrics = [...new Map(matrix.rows.map((row) => [row.metric, row.label])).entries()];
  const sig = (row) => row.cells.map((cell) => `${cell.state}:${CELL_TEXT[cell.state](cell)}`).join("|");
  return <div className="sy-cov">
    <ul className="sy-legend" aria-label="ความหมายของสี">
      <li><span className="sy-cell full">ครบ</span></li><li><span className="sy-cell partial">กรอกบางวัน / เริ่มกลางเดือน</span></li>
      <li><span className="sy-cell not_filled">ทีมยังไม่กรอก</span></li><li><span className="sy-cell since">ระบบขายยังไม่เริ่มเก็บ / ไม่มีขั้นนี้</span></li>
    </ul>
    <div className="sy-table-scroll" role="region" aria-label="ความครบของข้อมูลระบบขาย" tabIndex={0}>
      <table className="sy-cov-table">
        <thead><tr>
          <th scope="col">ตัวชี้วัด / แบรนด์</th>
          {matrix.ranges.map((range) => <th scope="col" key={range.month}>{monthLabel(range.month)}{range.partialStart || range.open ? <small>{range.open ? (range.partialStart ? `${shortDay(range.start)}–วันนี้` : "ถึงวันนี้") : `${shortDay(range.start)}–${shortDay(range.end)}`}</small> : null}</th>)}
        </tr></thead>
        <tbody>
          {metrics.map(([metric, label]) => {
            const rows = matrix.rows.filter((row) => row.metric === metric);
            const same = rows.length > 1 && rows.every((row) => sig(row) === sig(rows[0]));
            const shown = same ? [{ ...rows[0], brandId: null }] : rows;
            return [
              <tr key={metric} className="sy-cov-group"><th scope="rowgroup" colSpan={matrix.months.length + 1}>{label}</th></tr>,
              ...shown.map((row) => <tr key={`${metric}-${row.brandId ?? "all"}`}>
                <th scope="row">{row.brandId ? names.get(row.brandId) ?? row.brandId : "ทุกแบรนด์"}</th>
                {row.cells.map((cell) => <td key={cell.month}><span className={`sy-cell ${cellTone(cell)}`}>{CELL_TEXT[cell.state](cell)}</span></td>)}
              </tr>),
            ];
          })}
        </tbody>
      </table>
    </div>
    {waiting.length > 0 && <p className="sy-note">{waiting.map((brand) => brand.name).join(" · ")}: รอเชื่อมแหล่งข้อมูลยอดขาย · วันนี้ยังไม่ปิดไม่นับเป็นวันที่ทีมไม่กรอก</p>}
    {waiting.length === 0 && <p className="sy-note">วันนี้ยังไม่ปิดไม่นับเป็นวันที่ทีมไม่กรอก</p>}
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
          <span>{view?.postMediaPct == null ? "—" : fmtPct(view.postMediaPct)}</span>
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

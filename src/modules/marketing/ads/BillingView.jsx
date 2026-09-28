/* หน้า "บิล & กระทบยอด" (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   team_lead เท่านั้น (RLS คุมฝั่งฐานอีกชั้น) · มุมมองรายเดือน — ไม่มี PDF (ลิงก์เดียวไป Billing hub ของ Meta)
   ภาษาเดียวกับหน้า Overview: ตัวเลข 2 ตำแหน่งไม่ปัด · ป้าย .aw-flag เฉพาะเมื่อมีเรื่อง · แถวปกติเงียบ */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { useAdsData } from "./useAdsData.js";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { fmtMoney, fmtNum } from "../dash/charts/theme.js";
import { buildBillingModel, connectionsFromCards, reviewVerdict } from "./billingModel.js";
import { factsLoadRange } from "./adsFacts.js";
import { parseRuleNumber } from "../creatives/creativeRules.js";
import "./adsWorkspace.css";
import "./billingView.css";
import { DAILY_RUN_LABEL } from "../../../../supabase/functions/_shared/dailySchedule.js";

const money = (n) => (n == null ? "—" : fmtMoney(n));
const monthIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (iso, by) => { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + by); return monthIso(d); };
/* facts โหลดย้อน 200 วัน (adsFacts.factsLoadRange) — เดือนที่เก่ากว่านั้นตารางจะว่างเพราะไม่มี cards
   ไม่ใช่เพราะไม่มีค่าแอด · ต้องบอกให้ชัด ไม่งั้นอ่านผิดว่าเดือนนั้นไม่ได้ยิงแอด */
const FACTS_WINDOW_DAYS = 200;
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayTh = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
const coverText = (c) => (!c.coverFrom ? null : c.coverFrom === c.coverTo ? dayTh(c.coverFrom) : `${dayTh(c.coverFrom)} – ${dayTh(c.coverTo)}`);
const VAT_MODE_TEXT = { included: "ยอดตัดน่าจะรวม VAT 7% (ดูจากยอดสะสม)", excluded: "ยอดตัดไม่รวม VAT", given: "VAT ตามไฟล์" };
/* ยอดที่ไม่รู้แน่ (เวลาตัดในวันไม่รู้) แสดงเป็นช่วง — ห้ามเลือกตัวเลขเดียวให้ดูแน่นอนกว่าความจริง */
const moneyRange = (min, max) => (min == null ? "—" : max == null ? `อย่างน้อย ${money(min)}` : Math.abs(max - min) < 0.005 ? money(min) : `${money(min)} – ${money(max)}`);

/* รายการที่ Meta ตัดบัตรของเดือนนี้ + ช่วงค่าแอดที่แต่ละครั้งครอบคลุม (สเปก 2026-09-26 charge-match)
   ป้ายเฉพาะผิดปกติ · ท้าย: ค่าแอดที่ยังไม่ถูกตัด เทียบยอดค้างใน Meta (เดือนปัจจุบัน) */
function ChargeList({ row, current }) {
  const m = row.chargeMatch;
  const list = row.charge?.charges ?? [];
  return <div className="bl-charge-list" role="group" aria-label="รายการที่ Meta ตัดบัตร">
    <b>Meta ตัดบัตร {list.length} ครั้งในเดือนนี้ <small className="zinc">· {m.vatAmbiguous ? "ยังแยกไม่ออกว่ายอดตัดรวม VAT ไหม — คิดแบบไม่รวม" : VAT_MODE_TEXT[m.vatMode]}</small></b>
    {list.length === 0 && <small className="zinc">ไม่มีรายการตัดในเดือนนี้</small>}
    {/* key รวมเลขอ้างอิง+วัน+ลำดับ — ไฟล์ที่ไม่มีเลขอ้างอิงแต่ตัดวันเดียวกันสองครั้ง key ต้องไม่ชน (ชุด D) */}
    {list.map((c, i) => <div key={`${c.reference ?? ""}|${c.date}|${i}`}>
      <span>{dayTh(c.date)}</span><b>{money(c.amount)}</b>
      <small className="zinc">{c.reference}{coverText(c) ? ` · ครอบคลุมค่าแอด ${coverText(c)}` : ""}</small>
      {/* ฐานเดียวกับยอดที่ตัดในแถวเดียวกัน (รวม VAT ถ้ายอดตัดรวม VAT) */}
      {c.status === "over" && <span className="aw-flag aw-flag--rose">ตัดเกินค่าแอด {money(c.uncoveredGross)}</span>}
      {c.status === "nodata" && <span className="aw-flag aw-flag--amber">ค่าแอดย้อนไม่ถึง</span>}
      {c.status === "pending" && <span className="aw-flag aw-flag--amber">รอค่าแอดวันนั้น</span>}
      {/* แยก VAT ไม่ออก: เกินเฉพาะเมื่อยอดตัดไม่รวม VAT — เหลือง ให้คนเช็กใบกำกับ ไม่ใช่แดงตัดเกิน (ทดสอบละเอียดรอบ 2) */}
      {c.status === "vatcheck" && <span className="aw-flag aw-flag--amber" title="ถ้ายอดตัดของบัญชีนี้ไม่รวม VAT แปลว่าตัดเกินค่าแอด — เช็กใบกำกับใน Billing hub">เกินถ้าไม่คิด VAT {money(c.uncoveredGross)}</span>}
    </div>)}
    {current && <p className={`bl-unbilled${m.balanceGap ? " amber" : ""}`}>ใช้แล้วยังไม่ถูกตัด {moneyRange(m.unbilledMin, m.unbilledMax)}{m.vatMode === "excluded" ? "" : " (รวม VAT)"} · ยอดค้างใน Meta {money(m.balance)}{m.balanceGap ? " — ไม่อยู่ในช่วงนี้" : ""}</p>}
  </div>;
}

const STATUS_TEXT = { match: "ตรงกัน", minor: "ต่างเล็กน้อย", review: "ต้องตรวจ", nostatement: "รอยอดใบแจ้งยอด", offsystem: "นอกระบบ" };
const STATUS_TONE = { match: "emerald", minor: "amber", review: "rose", nostatement: "zinc", offsystem: "rose" };

function ConfirmForm({ row, month, onSaved, onCancel }) {
  const [statementText, setStatementText] = useState(row.statement != null ? String(row.statement) : "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);   // ค่าที่รอยืนยัน — ผลตรวจ append-only แก้ไม่ได้ จึงต้องให้ดูอีกรอบก่อนส่ง (ชุด D ข้อ 18)
  /* ฟอร์มเปล่ากดบันทึกได้ = ได้หลักฐาน "ตรวจแล้ว" ที่ไม่มีอะไรยืนยันว่าตรวจอะไร
     และลบไม่ได้เพราะ append-only — ต้องกรอกอย่างน้อยหนึ่งอย่างก่อน (B2 22 ก.ย.) */
  const empty = statementText.trim() === "" && note.trim() === "";
  const review = () => {
    const statement = parseRuleNumber(statementText);
    if (Number.isNaN(statement)) { setError("ยอดก่อน VAT ต้องเป็นตัวเลข เช่น 180,900"); return; }
    setError(null);
    setPending({ statement, note: note.trim(), verdict: reviewVerdict(statement, row.spend) });
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      /* ไม่ส่ง reviewer — RPC ผูกชื่อจาก auth.uid() ฝั่ง server (กันปลอมชื่อคนตรวจ · security-review 22 ก.ย.) */
      await apiClient.ads.addBillingReview({
        month, external_account_id: row.external_account_id,
        verdict: pending.verdict, statement_amount: pending.statement, note: pending.note,
      });
      onSaved();
    } catch { setError("บันทึกไม่สำเร็จ — ข้อมูลที่กรอกยังอยู่ กดยืนยันอีกครั้งได้"); }
    finally { setSaving(false); }
  };
  if (pending) return <div className="bl-confirm bl-confirm--check" role="group" aria-label="ยืนยันบันทึกผลตรวจ">
    <b>ตรวจก่อนบันทึก — บันทึกแล้วแก้ไม่ได้</b>
    <dl>
      <div><dt>ยอดก่อน VAT ตามใบแจ้งยอด</dt><dd>{pending.statement == null ? "ไม่ได้กรอก" : money(pending.statement)}</dd></div>
      <div><dt>หมายเหตุ</dt><dd>{pending.note || "—"}</dd></div>
      <div><dt>ผล</dt><dd>{pending.verdict === "match" ? "ตรงกับค่าแอดที่ระบบนับ" : "บันทึกเป็น 'มีหมายเหตุ'"}</dd></div>
    </dl>
    {error && <p className="bl-error" role="alert">{error}</p>}
    <div className="bl-confirm-actions">
      <button type="button" disabled={saving} onClick={save}>{saving ? "กำลังบันทึก…" : "ยืนยันบันทึก"}</button>
      <button type="button" className="bl-ghost" disabled={saving} onClick={() => { setPending(null); setError(null); }}>กลับไปแก้</button>
    </div>
  </div>;
  return <div className="bl-confirm">
    {/* ระบบเทียบกับค่าแอดก่อน VAT — ต้องบอก ไม่งั้นบัญชีกรอกยอดรวม VAT แล้วขึ้น "ต้องตรวจ" ผิด (ทดสอบแบบผู้ใช้จริง) */}
    <label><span>ยอดก่อน VAT ตามใบแจ้งยอด</span>
      <input type="text" inputMode="decimal" aria-label="ยอดก่อน VAT ตามใบแจ้งยอด" placeholder="ไม่กรอกก็ได้ เช่น 180,900"
        value={statementText} onChange={(e) => setStatementText(e.target.value)} /></label>
    <label><span>หมายเหตุ</span>
      <input type="text" aria-label="หมายเหตุ" placeholder="เช่น เทียบใบแจ้งยอดแล้ว"
        value={note} onChange={(e) => setNote(e.target.value)} /></label>
    {error && <p className="bl-error" role="alert">{error}</p>}
    {empty && <p className="bl-hint">กรอกยอดใบแจ้งยอดหรือหมายเหตุอย่างน้อยหนึ่งอย่างก่อนบันทึก</p>}
    <div className="bl-confirm-actions">
      <button type="button" disabled={empty} onClick={review}>บันทึกผลตรวจ</button>
      <button type="button" className="bl-ghost" onClick={() => onCancel?.()}>ยกเลิก</button>
    </div>
  </div>;
}

export function BillingView({ month: initialMonth }) {
  const { data } = useApp();
  const { user } = useAuth();
  const ads = useAdsData();
  const [month, setMonth] = useState(() => initialMonth ?? monthIso(new Date()));
  const [remote, setRemote] = useState({ status: "loading", snapshots: [], reviews: [], charges: [] });
  const [openAccount, setOpenAccount] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [savedName, setSavedName] = useState(null);
  const isLead = user?.role === "team_lead";

  useEffect(() => {
    if (!isLead) return;
    let alive = true;
    setRemote((r) => ({ ...r, status: "loading" }));
    Promise.all([apiClient.ads.accountSnapshots(), apiClient.ads.billingReviews(month), apiClient.ads.billingCharges(month)])
      .then(([snapshots, reviews, charges]) => { if (alive) setRemote({ status: "ready", snapshots, reviews, charges }); })
      .catch(() => { if (alive) setRemote({ status: "error", snapshots: [], reviews: [], charges: [] }); });
    return () => { alive = false; };
  }, [month, isLead, reloadKey]);

  const thisMonth = monthIso(new Date());
  const atLatestMonth = month >= thisMonth;
  /* ค่าแอดโหลดย้อน 200 วัน — เดือนที่เริ่มก่อนนั้นมีข้อมูลไม่ครบ (ครึ่งเดือนหรือไม่มีเลย) ต้องเป็น "—" ไม่ใช่ ฿0/ยอดบางส่วน
     เดิมเช็กแค่ "ห่างเกิน 200 วัน" → มี.ค. (ข้อมูลเริ่ม 12 มี.ค.) ขึ้นยอดครึ่งเดือนเหมือนจริง และผลตรวจเทียบ ฿0 ขึ้น "ต้องตรวจ" (ทดสอบละเอียดรอบ 2) */
  const loadFrom = factsLoadRange(isoToday(), FACTS_WINDOW_DAYS).from;
  /* วันแรกที่ระบบมีค่าแอดจริง (ทดสอบละเอียดรอบ 2: หน้าจริงมีตั้งแต่ 18 มิ.ย. — เม.ย./พ.ค. ขึ้น ฿0.00 · มิ.ย. ขึ้นแค่ 18–30 เหมือนทั้งเดือน) */
  const dataFrom = ads.pilot?.summary?.from ?? null;
  const windowFrom = dataFrom && dataFrom > loadFrom ? dataFrom : loadFrom;
  const outOfWindow = month < windowFrom;
  /* ค่าแอดมาจาก useAdsData — ยังโหลด/โหลดไม่สำเร็จ/เป็นข้อมูลจำลอง = "ไม่รู้" ต้องขึ้น — ไม่ใช่ ฿0.00
     (รีวิว UX 25 ก.ย.: เดิมโหลดพังแล้วการ์ดขึ้น ฿0.00 คนอ่านเข้าใจว่าเดือนนี้ไม่มีค่าแอด) */
  const spendState = ads.source !== "meta_pilot" ? "mock" : ads.pilot?.status === "ready" ? "ready" : ads.pilot?.status === "error" ? "error" : "loading";
  const spendKnown = spendState === "ready" && !outOfWindow;
  const today = isoToday();   // อยู่ใน deps — เปิดหน้าข้ามเที่ยงคืนแล้วโมเดลต้องคิดวันใหม่
  const model = useMemo(() => buildBillingModel({
    month, cards: spendKnown ? ads.cards ?? [] : [], connections: connectionsFromCards(spendKnown ? ads.cards ?? [] : []),
    snapshots: remote.snapshots, reviews: remote.reviews, brands: data.brands ?? [], spendKnown,
    charges: remote.charges, today,
  }), [month, ads.cards, remote, data.brands, spendKnown, today]);
  const currentMonth = month.slice(0, 7) === today.slice(0, 7);
  /* ค่าแอดดึงวันละครั้งตอนเช้า — เดือนนี้นับถึงเมื่อวาน แต่ Billing hub รวมวันนี้ด้วย ต้องบอกวันที่ ไม่งั้นเทียบแล้วนึกว่าไม่ตรง (ทดสอบแบบผู้ใช้จริง) */
  const spendThrough = currentMonth ? (ads.cards ?? []).filter((c) => Number(c?.metrics?.spend) > 0).map((c) => String(c.fact_date ?? "").slice(0, 10)).filter((d) => d.startsWith(month.slice(0, 7))).sort().at(-1) : null;
  const spendThroughText = spendThrough && spendThrough < today ? ` · ค่าแอดถึง ${dayTh(spendThrough)}` : "";

  /* การเงินบริษัท — จำกัดตามข้อเคาะ 22 ก.ย. · RLS ฝั่งฐานปิดข้อมูลอยู่แล้ว หน้านี้แค่ไม่หลอกให้กดต่อ */
  if (!isLead) return <main className="aw bl"><section className="aw-panel"><p>หน้านี้เปิดให้เฉพาะหัวหน้าทีม (team_lead)</p></section></main>;

  return <main className="aw bl">
    <section className="aw-panel">
      <div className="bl-head">
        <div>
          <h1>บิล &amp; กระทบยอดค่าแอด</h1>
          <p>ค่าแอด Meta รายเดือนเทียบใบแจ้งยอด · ใบกำกับภาษีตัวจริงอยู่ที่ <a href="https://business.facebook.com/billing_hub/payment_activity" target="_blank" rel="noreferrer">Billing hub ของ Meta</a></p>
        </div>
        <div className="bl-month" role="group" aria-label="เลือกรอบเดือน">
          <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => setMonth((m) => shiftMonth(m, -1))}>‹</button>
          <b>{model.rangeLabel}</b>
          <button type="button" aria-label="เดือนถัดไป" disabled={atLatestMonth}
            title={atLatestMonth ? "เดือนปัจจุบันคือรอบล่าสุด" : undefined}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}>›</button>
        </div>
      </div>

      {model.alerts.length > 0 && <div className="bl-alerts">
        {model.alerts.map((a) => <span key={a.key} className={`aw-flag aw-flag--${a.tone === "rose" ? "rose" : "amber"}`}>{a.text}</span>)}
      </div>}

      <div className="bl-stats">
        <div><span>ระบบนับได้ · {model.rangeLabel}</span><b>{money(model.totals.spend)}</b><small>{spendKnown ? `รวม ${model.rows.filter((r) => r.connected).length} บัญชีที่เชื่อม${spendThroughText}` : "ยังไม่มีตัวเลข"}</small></div>
        <div><span>Meta ตัดจริง</span><b>{money(model.totals.charged)}</b><small>{model.totals.charged == null ? `ยังไม่มีรายการ · ดึงทุกเช้า ${DAILY_RUN_LABEL}` : "ดึงจาก Meta ทุกเช้า"}</small></div>
        <div><span>VAT 7%</span><b>{money(model.totals.vat)}</b><small>ค่าประมาณ — ใบกำกับจริงที่ Billing hub</small></div>
        <div><span>รวมโดยประมาณ</span><b>{money(model.totals.gross)}</b><small>ระบบนับ + VAT</small></div>
        <div><span>ยอดค้างที่ Meta ยังไม่ตัด</span><b>{money(model.totals.balance)}</b><small>{remote.status === "error" ? "โหลดไม่สำเร็จ" : model.pastMonth ? "ยอดค้างเป็นของวันนี้ — ดูที่เดือนปัจจุบัน" : model.totals.balance == null ? "รอระบบดึงยอดค้างจาก Meta รอบแรก" : "ดึงจาก Meta รอบล่าสุด"}</small></div>
      </div>

      {outOfWindow && <p className="aw-key">ข้อมูลค่าแอดของเดือนนี้ไม่ครบ — {windowFrom === loadFrom ? `เกินช่วงข้อมูลที่ระบบเก็บไว้ (${FACTS_WINDOW_DAYS} วันล่าสุด ตั้งแต่ ${dayTh(windowFrom)})` : `ระบบมีข้อมูลค่าแอดตั้งแต่ ${dayTh(windowFrom)}`} ตัวเลขค่าแอดจึงไม่แสดง ไม่ได้แปลว่าเดือนนั้นไม่ได้ยิงแอด</p>}
      {spendState === "error" && <div className="bl-alert" role="alert">
        <span><b>โหลดค่าแอดไม่สำเร็จ</b> — ตัวเลขจึงยังไม่แสดง ไม่ได้แปลว่าเดือนนี้ไม่มีค่าแอด</span>
        <button type="button" onClick={() => ads.reload?.()}>ลองใหม่</button>
      </div>}
      {spendState === "loading" && <p className="aw-key">กำลังโหลดค่าแอด…</p>}
      {spendState === "mock" && <p className="bl-notice" role="status">หน้าหลักกำลังแสดงข้อมูลจำลอง — หน้าบิลไม่เอาตัวเลขจำลองมากระทบยอด สลับเป็นข้อมูลจริงก่อนจึงจะเห็นตัวเลข</p>}
      {remote.status === "loading" && <p className="aw-key">กำลังโหลดข้อมูลบิล…</p>}
      {remote.status === "error" && <div className="bl-alert" role="alert">
        <span><b>ยอดค้างและผลตรวจโหลดไม่สำเร็จ</b>{spendKnown ? " — ตัวเลขระบบนับยังถูกต้อง" : ""}</span>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)}>ลองใหม่</button>
      </div>}

      <p className="bl-saved" role="status" aria-label="ผลการบันทึก">{savedName ? `บันทึกผลตรวจ ${savedName} แล้ว` : ""}</p>

      <div className="bl-table" role="table" aria-label="กระทบยอดรายบัญชี">
        <div className="bl-row bl-row--head" role="row">
          <span>แบรนด์ · บัญชี</span><span className="num">ระบบนับ</span><span className="num">Meta ตัดจริง</span><span className="num">VAT ประมาณ</span>
          <span className="num">ยอดค้าง</span><span className="num">ใบแจ้งยอด</span><span>ผลเทียบ</span><span>ผลตรวจ</span>
        </div>
        {model.rows.map((row) => <div key={row.external_account_id} data-row
          className={`bl-row-wrap${openAccount === row.external_account_id ? " is-open" : ""}`}>
          {/* กดที่ไหนก็ได้ในแถวเพื่อกางรายละเอียด (กติกาเดียวกับตารางแบรนด์หน้า Overview) */}
          <div className="bl-row" role="row" onClick={() => setOpenAccount(openAccount === row.external_account_id ? null : row.external_account_id)}>
            <span>
              {/* ชื่อเป็นปุ่มกาง/พับ — เปิดด้วยคีย์บอร์ดได้เสมอ แม้ตรวจแล้วปุ่มกรอกผลตรวจหายไป (ชุด B ข้อ 16) */}
              <button type="button" className="bl-name" aria-expanded={openAccount === row.external_account_id} aria-label={`รายละเอียด ${row.brandName || row.accountName}`}
                onClick={(e) => { e.stopPropagation(); setOpenAccount(openAccount === row.external_account_id ? null : row.external_account_id); }}><b>{row.brandName || row.accountName}</b></button>
              <small>{row.connected
                ? (row.accountName !== row.external_account_id ? `${row.accountName} · …${row.external_account_id.slice(-4)}` : `บัญชี …${row.external_account_id.slice(-4)}`)
                : "ยังไม่ได้เชื่อมเข้าระบบ"}</small>
            </span>
            <span className="num" data-label="ระบบนับ">{money(row.spend)}</span>
            <span className={`num${row.charge ? "" : " zinc"}`} data-col="charged" data-label="Meta ตัดจริง">{row.charge ? money(row.charge.charged) : "—"}</span>
            <span className="num zinc" data-label="VAT ประมาณ">{money(row.vat)}</span>
            <span className={`num${row.balance == null ? " zinc" : ""}`} data-label="ยอดค้าง">{money(row.balance)}</span>
            <span className={`num${row.statement == null ? " zinc" : ""}`} data-label="ใบแจ้งยอด">{money(row.statement)}</span>
            <span>
              <span className={row.status === "offsystem" && !(row.spend > 0) ? "zinc" : STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</span>
              {row.diff != null && <small className="zinc"> {row.diff >= 0 ? "+" : "−"}{fmtMoney(Math.abs(row.diff)).slice(1) /* ตัด ฿ ซ้ำ */} ({fmtNum((row.diffPct ?? 0) * 100, 2)}%)</small>}
              {row.flag && <span className={`aw-flag aw-flag--${row.flag.tone}`}>{row.flag.text}</span>}
            </span>
            <span>
              {row.review
                ? <small className="zinc">{row.review.verdict === "match" ? "ตรวจแล้ว · ตรง" : "ตรวจแล้ว · มีหมายเหตุ"}<br />{row.review.reviewer}</small>
                : <button type="button" className="bl-verify" aria-label={`กรอกผลตรวจ · ${row.brandName || row.accountName}`}
                    onClick={(e) => { e.stopPropagation(); setOpenAccount(openAccount === row.external_account_id ? null : row.external_account_id); }}>
                    กรอกผลตรวจ
                  </button>}
            </span>
          </div>
          {openAccount === row.external_account_id && <div className="bl-detail">
            {/* คอลัมน์ที่ซ่อนตอนจอแคบ (VAT · ใบแจ้งยอด) มาอยู่ตรงนี้ — จอกว้าง CSS ซ่อนเพราะเห็นในแถวแล้ว */}
            <dl className="bl-detail-facts">
              <div><dt>VAT ประมาณ</dt><dd>{money(row.vat)}</dd></div>
              <div><dt>ใบแจ้งยอด</dt><dd>{money(row.statement)}</dd></div>
            </dl>
            {row.campaigns.length > 0 && <div className="bl-campaigns">
              <b>เงินก้อนนี้ไปกับอะไร</b>
              {row.campaigns.slice(0, 5).map((c) => <div key={c.name}><span>{c.name}</span><b>{money(c.spend)}</b><small className="zinc">{fmtNum(c.share * 100, 2)}%</small></div>)}
              {row.campaigns.length > 5 && <small className="zinc">อีก {row.campaigns.length - 5} แคมเปญ</small>}
            </div>}
            {row.chargeMatch && <ChargeList row={row} current={currentMonth} />}
            {/* ตรวจแล้วก็บันทึกซ้ำได้ — append-only ใช้ผลใหม่สุด (ทางแก้ผลที่บันทึกผิด) */}
            <ConfirmForm row={row} month={month} onCancel={() => setOpenAccount(null)}
              onSaved={() => { setSavedName(row.brandName || row.accountName); setOpenAccount(null); setReloadKey((k) => k + 1); }} />
          </div>}
        </div>)}
      </div>

      {model.offSystemIdle.length > 0 && <p className="aw-key">บัญชีนอกระบบที่เดือนนี้ไม่ได้ใช้เงิน {model.offSystemIdle.length} บัญชี · {model.offSystemIdle.map((a) => a.accountName).join(" · ")}</p>}
      {/* เดือนที่ผ่านมาแล้ว ไม่มียอดของเดือนนั้นในระบบ = ไม่มีอะไรให้ตรวจ ไม่ขึ้นเป็นแถว (ตรวจรอบ 28 ก.ย.) */}
      {model.offSystemUnknown?.length > 0 && <p className="aw-key">บัญชีนอกระบบที่ไม่มียอดของเดือนนี้ในระบบ {model.offSystemUnknown.length} บัญชี · {model.offSystemUnknown.map((a) => a.accountName).join(" · ")}</p>}

      {/* ยังไม่มีรายการตัดบัตร = บอกบรรทัดเดียวว่าคอลัมน์นี้มาจากไหน (ไม่ใช่คำเตือน) · 29 ก.ย. ดึงจาก Meta เอง ไม่มีการนำเข้าไฟล์ */}
      {remote.status === "ready" && model.totals.charged == null && <p className="aw-key">ระบบดึงรายการตัดบัตรจาก Meta ทุกวันตอน {DAILY_RUN_LABEL} น. — เดือนนี้ยังไม่มีรายการ (หรือยังไม่ถึงรอบดึงครั้งแรก · กด "ดึงยอดค้างบัญชีแอด" ในหน้าสถานะ Sync เพื่อดึงเดี๋ยวนี้)</p>}

      <p className="aw-key">ระบบนับ = ผลรวมค่าแอดรายวันของเดือนจาก Meta · VAT เป็นค่าประมาณ (คำนวณ 7%) ไม่ใช่เอกสารทางการ · เกณฑ์ผลเทียบ: ≤ 0.50% ตรงกัน · ≤ 2.00% ต่างเล็กน้อย · เกิน = ต้องตรวจ · ผลตรวจเก็บแบบเพิ่มอย่างเดียว แก้ย้อนหลังไม่ได้{model.totals.charged != null ? " · รายการตัดบัตร: ระบบรู้ค่าแอดรายวันแต่ไม่รู้ว่า Meta ตัดตอนไหนของวัน ยอดที่ยังไม่ถูกตัดจึงเป็นช่วง · ตรวจโดยตั้งต้นจากรายการตัดย้อนหลัง 2 เดือน (ส่วนเกินที่น้อยกว่าค่าแอดหนึ่งวันของรายการตั้งต้นตรวจไม่ได้)" : ""}</p>
    </section>
  </main>;
}

/* หน้า "บิล & กระทบยอด" (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   ทำให้ง่ายลง 29 ก.ย. (อาร์ต: "ใช้งานยาก เอาให้ง่ายกว่าเดิม ไม่ต้องอะไรเยอะ") — คอลัมน์เดียว 3 ส่วน:
   1) เดือนนี้จ่ายไปเท่าไหร่ + ปกติไหม  2) เรื่องที่ต้องดู (ขึ้นเฉพาะเมื่อมี)  3) ใบเสร็จ (กรองบัญชีด้วยปุ่ม · กดดูรายละเอียด)
   ของสำหรับฝ่ายบัญชี (เทียบกับค่าแอด · ตารางรายบัญชี · บันทึกผลตรวจ) พับไว้ในหัวข้อเดียวด้านล่าง
   team_lead เท่านั้น (RLS คุมฝั่งฐานอีกชั้น) · ตัวเลข 2 ตำแหน่งไม่ปัด */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { useAdsData } from "./useAdsData.js";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { fmtNum } from "../dash/charts/theme.js";
import { buildBillingModel, connectionsFromCards, metaCardsOnly, reviewVerdict } from "./billingModel.js";
import { billListCsv, billingHubUrl, buildBillList } from "./billList.js";
import { BillSheet, ReceiptList } from "./BillReceipts.jsx";
import { BrandMark } from "./BrandMark.jsx";
import { dayTh, money, monthTh, signed } from "./billFormat.js";
import { factsLoadRange } from "./adsFacts.js";
import { parseRuleNumber } from "../creatives/creativeRules.js";
import "./adsWorkspace.css";
import "./billingView.css";
import { DAILY_RUN_LABEL } from "../../../../supabase/functions/_shared/dailySchedule.js";

const HUB = "https://business.facebook.com/billing_hub/payment_activity";
const monthIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (iso, by) => { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + by); return monthIso(d); };
/* facts โหลดย้อน 200 วัน (adsFacts.factsLoadRange) — เดือนที่เก่ากว่านั้นไม่มีค่าแอด ต้องบอกให้ชัด ไม่ใช่ขึ้น ฿0 */
const FACTS_WINDOW_DAYS = 200;
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/* ยอดที่ไม่รู้แน่ (เวลาตัดในวันไม่รู้) แสดงเป็นช่วง — ห้ามเลือกตัวเลขเดียวให้ดูแน่นอนกว่าความจริง */
const moneyRange = (min, max) => (min == null ? "—" : max == null ? `อย่างน้อย ${money(min)}` : Math.abs(max - min) < 0.005 ? money(min) : `${money(min)} – ${money(max)}`);
const STATUS_TEXT = { match: "ตรงกับใบแจ้งยอด", minor: "ต่างจากใบแจ้งยอดเล็กน้อย", review: "ต่างจากใบแจ้งยอดเกินเกณฑ์" };

function downloadText(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** เปิดหน้าต่างบิลแล้วปิด = โฟกัสกลับไปที่แถวเดิม (คีย์บอร์ดไม่หลงตำแหน่ง) */
function useBillSheet() {
  const [open, setOpen] = useState(null);
  const trigger = useRef(null);
  const show = (item) => { trigger.current = document.activeElement; setOpen(item); };
  const close = () => { setOpen(null); requestAnimationFrame(() => trigger.current?.focus?.()); };
  return { open, show, close };
}

const nameOf = (row) => row.brandName || row.accountName;

/* เรื่องที่ต้องดู — เป็นประโยคบอกว่าเกิดอะไร + ทำอะไรต่อ · ของที่เกี่ยวกับบัญชีเดียวมีปุ่มดูใบเสร็จของบัญชีนั้น */
function issuesOf(model) {
  const out = model.alerts.map((a) => ({ key: a.key, tone: a.tone === "rose" ? "rose" : "amber", text: a.text, account: null }));
  for (const r of model.rows) {
    const m = r.chargeMatch;
    if (r.flag?.text === "ยอดค้างไม่ตรง") out.push({ key: `bal-${r.external_account_id}`, tone: "amber", account: r.external_account_id,
      text: `${nameOf(r)}: ยอดค้างใน Meta ${money(r.balance)} ไม่อยู่ในช่วงที่ระบบคำนวณ (${moneyRange(m?.unbilledMin, m?.unbilledMax)}) — เทียบใน Billing hub` });
    if (r.flag?.text === "เช็ก VAT") out.push({ key: `vat-${r.external_account_id}`, tone: "amber", account: r.external_account_id,
      text: `${nameOf(r)}: มีบิลที่เกินค่าแอดถ้ายอดตัดไม่รวม VAT — เช็กใบกำกับใน Billing hub` });
  }
  return out;
}

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
    <div className="bl-confirm-fields">
      <label><span>ยอดก่อน VAT ตามใบแจ้งยอด</span>
        <input type="text" inputMode="decimal" aria-label="ยอดก่อน VAT ตามใบแจ้งยอด" placeholder="ไม่กรอกก็ได้ เช่น 180,900"
          value={statementText} onChange={(e) => setStatementText(e.target.value)} /></label>
      <label><span>หมายเหตุ</span>
        <input type="text" aria-label="หมายเหตุ" placeholder="เช่น เทียบใบแจ้งยอดแล้ว"
          value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </div>
    {error && <p className="bl-error" role="alert">{error}</p>}
    {empty && <p className="bl-hint">กรอกยอดใบแจ้งยอดหรือหมายเหตุอย่างน้อยหนึ่งอย่างก่อนบันทึก</p>}
    <div className="bl-confirm-actions">
      <button type="button" disabled={empty} onClick={review}>บันทึกผลตรวจ</button>
      {!empty && <button type="button" className="bl-ghost" onClick={() => onCancel?.()}>ล้างที่กรอก</button>}
    </div>
  </div>;
}

/* ทำไมยอดตัดบัตรไม่เท่าค่าแอด — อยู่ในส่วนพับสำหรับฝ่ายบัญชี */
function Why({ b, month, current }) {
  const m = monthTh(month), prev = monthTh(shiftMonth(month, -1)), next = monthTh(shiftMonth(month, 1));
  const steps = [
    { key: "after", value: -b.afterMonth, label: current ? "ใช้แล้ว ยังไม่ถึงรอบตัดบัตร" : `ใช้ปลาย ${m} ไปตัดใน ${next}` },
    { key: "prev", value: b.fromPrev, label: `ค่าแอด ${prev} ที่มาตัดใน ${m}` },
    { key: "vat", value: b.vatCharged, label: "VAT ที่ Meta เก็บ" },
    { key: "unmatched", value: b.unmatched, label: "ไม่มีค่าแอดที่ระบบเห็นรองรับ", tone: "rose" },
    { key: "off", value: b.offSystem, label: "บัญชีนอกระบบ", tone: "rose" },
  ].filter((s) => Math.abs(s.value) >= 0.005);
  return <section className="bl-why" aria-labelledby="bl-why-title">
    <h3 id="bl-why-title">ทำไมยอดตัดบัตรไม่เท่ากับค่าแอด</h3>
    <dl>
      <div><dt>ค่าแอดที่ใช้ใน {m}</dt><dd>{money(b.spend)}</dd></div>
      {steps.map((s) => <div key={s.key} className={s.tone ?? ""}><dt>{s.label}</dt><dd>{signed(s.value)}</dd></div>)}
      <div className="bl-why-sum"><dt>Meta ตัดบัตรใน {m}</dt><dd>{money(b.charged)}</dd></div>
    </dl>
  </section>;
}

export function BillingView({ month: initialMonth }) {
  const { data } = useApp();
  const { user } = useAuth();
  const ads = useAdsData();
  const [month, setMonth] = useState(() => initialMonth ?? monthIso(new Date()));
  const [remote, setRemote] = useState({ status: "loading", snapshots: [], reviews: [], charges: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [savedName, setSavedName] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [account, setAccount] = useState("all");
  const sheet = useBillSheet();
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
  const loadFrom = factsLoadRange(isoToday(), FACTS_WINDOW_DAYS).from;
  /* วันแรกที่ระบบมีค่าแอดจริง (ทดสอบละเอียดรอบ 2: หน้าจริงมีตั้งแต่ 18 มิ.ย.) */
  const dataFrom = ads.pilot?.summary?.from ?? null;
  const windowFrom = dataFrom && dataFrom > loadFrom ? dataFrom : loadFrom;
  const outOfWindow = month < windowFrom;
  /* ยังโหลด/โหลดไม่สำเร็จ/ข้อมูลจำลอง = "ไม่รู้" ต้องขึ้น — ไม่ใช่ ฿0.00 (รีวิว UX 25 ก.ย.) */
  const spendState = ads.source !== "meta_pilot" ? "mock" : ads.pilot?.status === "ready" ? "ready" : ads.pilot?.status === "error" ? "error" : "loading";
  const spendKnown = spendState === "ready" && !outOfWindow;
  const today = isoToday();
  /* เฉพาะ Meta — ค่าแอดช่องทางอื่นเข้าระบบทางไฟล์ ไม่มีรายการตัดบัตรให้กระทบยอดที่หน้านี้ */
  const metaCards = useMemo(() => (spendKnown ? metaCardsOnly(ads.cards ?? []) : []), [ads.cards, spendKnown]);
  const model = useMemo(() => buildBillingModel({
    month, cards: metaCards, connections: connectionsFromCards(metaCards),
    snapshots: remote.snapshots, reviews: remote.reviews, brands: data.brands ?? [], spendKnown,
    charges: remote.charges, today,
  }), [month, metaCards, remote, data.brands, spendKnown, today]);
  const allBills = useMemo(() => buildBillList({ month, charges: remote.charges, rows: model.rows, snapshots: remote.snapshots }),
    [month, remote.charges, remote.snapshots, model.rows]);
  /* ปุ่มกรอง = ทุกบัญชีของเดือน (แถวกระทบยอด + บัญชีที่มีบิล) — เดือนที่ยังไม่มีบิลก็ต้องเลือกบัญชีไปบันทึกผลตรวจได้ */
  const chips = useMemo(() => {
    const map = new Map(model.rows.map((r) => [r.external_account_id, { id: r.external_account_id, name: nameOf(r), connected: r.connected }]));
    for (const a of allBills.accounts) if (!map.has(a.id)) map.set(a.id, { id: a.id, name: a.brandName || a.name, connected: a.connected });
    return [...map.values()];
  }, [model.rows, allBills.accounts]);
  /* บัญชีที่เลือกไม่มีในเดือนนี้ (เปลี่ยนเดือน) = กลับไปทุกบัญชี */
  const scope = account !== "all" && chips.some((a) => a.id === account) ? account : null;
  const items = scope ? allBills.items.filter((i) => i.accountId === scope) : allBills.items;
  const picked = scope ? model.rows.find((r) => r.external_account_id === scope) ?? null : null;
  const brands = data.brands ?? [];
  const brandFor = (accountId, fallbackName) => {
    const row = model.rows.find((r) => r.external_account_id === accountId);
    return (row?.brandId && brands.find((b) => b.id === row.brandId)) || { id: null, name: fallbackName };
  };
  const markFor = (i) => <BrandMark brand={brandFor(i.accountId, i.brandName || i.accountName)} size={28} />;
  /* ยอดตัดสำเร็จต่อบัญชี — ป้ายบนปุ่มกรอง (บวกเป็นสตางค์) */
  const chargedBy = useMemo(() => {
    const map = new Map();
    for (const i of allBills.items) if (i.kind === "charge") map.set(i.accountId, (map.get(i.accountId) ?? 0) + Math.round(i.amount * 100));
    return map;
  }, [allBills]);
  const spendThrough = month.slice(0, 7) === today.slice(0, 7)
    ? (ads.cards ?? []).filter((c) => Number(c?.metrics?.spend) > 0).map((c) => String(c.fact_date ?? "").slice(0, 10)).filter((d) => d.startsWith(month.slice(0, 7))).sort().at(-1) : null;

  /* การเงินบริษัท — จำกัดตามข้อเคาะ 22 ก.ย. · RLS ฝั่งฐานปิดข้อมูลอยู่แล้ว หน้านี้แค่ไม่หลอกให้กดต่อ */
  if (!isLead) return <main className="aw bl"><section className="aw-panel"><p>หน้านี้เปิดให้เฉพาะหัวหน้าทีม (team_lead)</p></section></main>;

  const ready = remote.status === "ready";
  const paid = ready && allBills.totals.chargedCount > 0 ? allBills.totals.charged : null;
  const issues = ready ? issuesOf(model) : [];
  const listTotal = items.filter((i) => i.kind === "charge").reduce((n, i) => n + Math.round(i.amount * 100), 0) / 100;
  const csvName = `meta-bills-${month.slice(0, 7)}${scope ? `-${scope}` : ""}.csv`;
  const whyOf = picked ? picked.bridge : model.bridge;

  return <main className="aw bl">
    <section className="aw-toolbar" aria-label="เลือกรอบบิล">
      <header className="aw-header">
        <div>
          <h1>บิลค่าแอด</h1>
          <p>ยอดที่ Meta ตัดบัตรจริง · ดึงใหม่ทุกเช้า {DAILY_RUN_LABEL}</p>
          {/* ตั้งแต่มีค่าแอด Google/ChatGPT ในระบบ ต้องบอกว่าหน้านี้ไม่ได้รวม ไม่งั้นคนอ่านจะนึกว่าครบทั้งบัตร
              เขียนเป็นภาษาคน ไม่พูดถึงวิธีที่ข้อมูลเข้าระบบ — กติกาเดิมของหน้านี้คือห้ามมีศัพท์ระบบ (billingView.component.test.jsx) */}
          <p className="bl-scope">นับเฉพาะ <b>Meta</b> — ค่าแอด Google Ads และ ChatGPT Ads ไม่รวมอยู่ในหน้านี้</p>
        </div>
        <div className="aw-header-actions">
          <div className="aw-presets bl-month" role="group" aria-label="เลือกรอบเดือน">
            <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => setMonth((x) => shiftMonth(x, -1))}>‹</button>
            <b>{model.rangeLabel}</b>
            <button type="button" aria-label="เดือนถัดไป" disabled={atLatestMonth} title={atLatestMonth ? "เดือนปัจจุบันคือรอบล่าสุด" : undefined}
              onClick={() => setMonth((x) => shiftMonth(x, 1))}>›</button>
          </div>
        </div>
      </header>
    </section>

    {outOfWindow && <p className="aw-key">ข้อมูลค่าแอดของเดือนนี้ไม่ครบ — {windowFrom === loadFrom ? `เกินช่วงข้อมูลที่ระบบเก็บไว้ (${FACTS_WINDOW_DAYS} วันล่าสุด ตั้งแต่ ${dayTh(windowFrom)})` : `ระบบมีข้อมูลค่าแอดตั้งแต่ ${dayTh(windowFrom)}`} ตัวเลขค่าแอดจึงไม่แสดง ไม่ได้แปลว่าเดือนนั้นไม่ได้ยิงแอด</p>}
    {spendState === "error" && <div className="bl-alert" role="alert">
      <span><b>โหลดค่าแอดไม่สำเร็จ</b> — ตัวเลขจึงยังไม่แสดง ไม่ได้แปลว่าเดือนนี้ไม่มีค่าแอด</span>
      <button type="button" onClick={() => ads.reload?.()}>ลองใหม่</button>
    </div>}
    {spendState === "loading" && <p className="aw-key">กำลังโหลดค่าแอด…</p>}
    {spendState === "mock" && <p className="bl-notice" role="status">หน้าหลักกำลังแสดงข้อมูลจำลอง — หน้าบิลไม่เอาตัวเลขจำลองมากระทบยอด สลับเป็นข้อมูลจริงก่อนจึงจะเห็นตัวเลข</p>}
    {remote.status === "loading" && <p className="aw-key">กำลังโหลดข้อมูลบิล…</p>}
    {remote.status === "error" && <div className="bl-alert" role="alert">
      <span><b>ยอดค้างและผลตรวจโหลดไม่สำเร็จ</b>{spendKnown ? " — ตัวเลขค่าแอดยังถูกต้อง" : ""}</span>
      <button type="button" onClick={() => setReloadKey((k) => k + 1)}>ลองใหม่</button>
    </div>}
    <p className="bl-saved" role="status" aria-label="ผลการบันทึก">{savedName ? `บันทึกผลตรวจ ${savedName} แล้ว` : ""}</p>

    {/* 1) เดือนนี้จ่ายไปเท่าไหร่ + ปกติไหม */}
    <section className="aw-panel bl-sum" aria-labelledby="bl-sum-title">
      <div className="bl-sum-main">
        <span id="bl-sum-title">จ่ายค่าแอด {model.rangeLabel}</span>
        <b className="bl-paid">{money(paid)}</b>
        <small>{paid == null ? (remote.status === "error" ? "โหลดไม่สำเร็จ" : `ยังไม่มีรายการตัดบัตร · ดึงทุกเช้า ${DAILY_RUN_LABEL}`)
          : <>{allBills.totals.chargedCount} ใบเสร็จ · VAT ที่ต้องยื่น ภ.พ.36 ประมาณ <b>{money(allBills.totals.vat36)}</b></>}</small>
      </div>
      {ready && paid != null && <div className={`bl-sum-status ${issues.length ? "warn" : "ok"}`} role="status">
        {issues.length ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        <span>{issues.length ? `มี ${issues.length} เรื่องต้องดู` : "ทุกอย่างปกติ"}</span>
      </div>}
    </section>

    {/* 2) เรื่องที่ต้องดู — ขึ้นเฉพาะเมื่อมี */}
    {issues.length > 0 && <section className="aw-panel bl-issues" aria-label="เรื่องที่ต้องดู">
      <ul>{issues.map((x) => <li key={x.key} className={x.tone}>
        <AlertTriangle size={16} aria-hidden="true" />
        <span>{x.text}</span>
        {x.account && <button type="button" onClick={() => setAccount(x.account)}>ดูใบเสร็จ</button>}
      </li>)}</ul>
    </section>}

    {/* 3) ใบเสร็จ — กรองบัญชีด้วยปุ่มด้านบน · กดแถวดูว่าบิลนั้นจ่ายค่าอะไร */}
    <section className="aw-panel bl-receipts" aria-labelledby="bl-receipts-title">
      <div className="bl-receipts-head">
        <h2 id="bl-receipts-title">ใบเสร็จ</h2>
        <div className="bl-receipts-actions">
          <a className="bl-link" href={scope ? billingHubUrl(scope) : HUB} target="_blank" rel="noreferrer">Billing hub <ExternalLink size={13} aria-hidden="true" /></a>
          <button type="button" className="bl-btn" disabled={!items.length} onClick={() => downloadText(csvName, billListCsv(items))}>
            <Download size={14} aria-hidden="true" /> ดาวน์โหลด CSV</button>
        </div>
      </div>
      {chips.length > 0 && <div className="bl-chips" role="group" aria-label="เลือกบัญชี">
        <button type="button" aria-pressed={!scope} onClick={() => setAccount("all")}>ทั้งหมด</button>
        {chips.map((a) => <button key={a.id} type="button" aria-pressed={scope === a.id} onClick={() => setAccount(a.id)}>
          {a.name}{spendKnown && !a.connected ? " (นอกระบบ)" : ""}
          {chargedBy.has(a.id) && <small>{money(chargedBy.get(a.id) / 100)}</small>}
        </button>)}
      </div>}
      {ready && <ReceiptList key={`${month}|${scope ?? "all"}`} items={items} known={spendKnown} markFor={markFor} onOpen={sheet.show}
        emptyText={`เดือนนี้ยังไม่มีรายการตัดบัตร — ระบบดึงจาก Meta ทุกวันตอน ${DAILY_RUN_LABEL} น. (หรือกด "ดึงยอดค้างบัญชีแอด" ในหน้าสถานะ Sync เพื่อดึงเดี๋ยวนี้)`} />}
      {ready && items.length > 0 && <p className="bl-total">รวมที่ตัดสำเร็จ {items.filter((i) => i.kind === "charge").length} ใบ <b>{money(listTotal)}</b></p>}
    </section>

    {/* ของฝ่ายบัญชี — พับไว้ ไม่ต้องเห็นทุกครั้ง */}
    {ready && <details className="aw-panel bl-acct">
      <summary>เทียบกับค่าแอด และบันทึกผลตรวจ <small>สำหรับฝ่ายบัญชี</small></summary>
      <div className="bl-acct-body">
        {whyOf && whyOf.spend != null && whyOf.charged > 0 && <Why b={whyOf} month={month} current={model.current} />}
        {spendKnown && model.rows.length > 0 && <div className="aw-table-scroll"><table className="aw-comparison bl-accounts" aria-label="กระทบยอดรายบัญชี">
          <thead><tr><th>บัญชี</th><th>ค่าแอด</th><th>ตัดบัตร</th>{model.current && <th>ยอดค้างใน Meta</th>}<th>สถานะ</th></tr></thead>
          <tbody>{model.rows.map((r) => <tr key={r.external_account_id} data-row>
            <th>{nameOf(r)}<small>{r.connected ? ` …${r.external_account_id.slice(-4)}` : " ยังไม่ได้เชื่อมเข้าระบบ"}</small></th>
            <td className={r.spend == null ? "zinc" : ""}>{r.spend == null ? "ไม่รู้" : money(r.spend)}</td>
            <td className={r.charge ? "" : "zinc"}>{r.charge ? money(r.charge.charged) : "—"}</td>
            {model.current && <td className={r.balance == null ? "zinc" : ""}>{money(r.balance)}</td>}
            <td data-col="status" className={r.action.tone}>{r.action.text}</td>
          </tr>)}</tbody>
        </table></div>}
        {model.offSystemIdle.length > 0 && <p className="aw-key">บัญชีนอกระบบที่เดือนนี้ไม่ได้ใช้เงิน {model.offSystemIdle.length} บัญชี · {model.offSystemIdle.map((a) => a.accountName).join(" · ")}</p>}
        {model.offSystemUnknown?.length > 0 && <p className="aw-key">บัญชีนอกระบบที่เดือนนี้ไม่มียอดและไม่ถูกตัดบัตร {model.offSystemUnknown.length} บัญชี · {model.offSystemUnknown.map((a) => a.accountName).join(" · ")}</p>}
        {spendThrough && spendThrough < today && <p className="aw-key">ค่าแอดเดือนนี้นับถึง {dayTh(spendThrough)} (ดึงวันละครั้งตอนเช้า)</p>}

        {/* ผลตรวจรายบัญชี (อาร์ตเคาะ 29 ก.ย.) · เลือกบัญชีจากปุ่มด้านบนก่อน · append-only ใช้ผลใหม่สุด */}
        <div className="bl-review">
          <h3>บันทึกผลตรวจ{picked ? ` · ${nameOf(picked)}` : ""}</h3>
          {!picked ? <p className="aw-key">เลือกบัญชีจากปุ่มในส่วนใบเสร็จก่อน แล้วค่อยบันทึกผลตรวจของบัญชีนั้น</p> : <>
            <p className="aw-key">{picked.review ? `ล่าสุด: ${picked.review.verdict === "match" ? "ตรง" : "มีหมายเหตุ"} · ${picked.review.reviewer}` : "ยังไม่ได้ตรวจเดือนนี้"}
              {picked.statement != null && ` · ใบแจ้งยอด ${money(picked.statement)} ${STATUS_TEXT[picked.status] ?? ""}${picked.diff != null ? ` (${signed(picked.diff)} · ${fmtNum((picked.diffPct ?? 0) * 100, 2)}%)` : ""}`}</p>
            <ConfirmForm key={formKey} row={picked} month={month} onCancel={() => setFormKey((k) => k + 1)}
              onSaved={() => { setSavedName(nameOf(picked)); setFormKey((k) => k + 1); setReloadKey((k) => k + 1); }} />
          </>}
        </div>
        <p className="aw-key">VAT ภ.พ.36 = 7% ของยอดที่จ่าย (ไม่นับบัญชีที่ Meta เก็บ VAT แล้ว) เป็นค่าประมาณ · ระบบไม่รู้ว่า Meta ตัดบัตรตอนไหนของวัน การแบ่งยอดตามวันจึงเป็นค่าประมาณ · เทียบใบแจ้งยอด ≤ 0.50% ตรงกัน · ≤ 2.00% ต่างเล็กน้อย · ผลตรวจแก้ย้อนหลังไม่ได้</p>
      </div>
    </details>}

    {sheet.open && <BillSheet item={sheet.open} cards={spendKnown ? ads.cards : []} spendKnown={spendKnown} dataFrom={dataFrom} onClose={sheet.close} />}
  </main>;
}

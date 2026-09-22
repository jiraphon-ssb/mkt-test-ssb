/* หน้า "บิล & กระทบยอด" (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   team_lead เท่านั้น (RLS คุมฝั่งฐานอีกชั้น) · มุมมองรายเดือน — ไม่มี PDF (ลิงก์เดียวไป Billing hub ของ Meta)
   ภาษาเดียวกับหน้า Overview: ตัวเลข 2 ตำแหน่งไม่ปัด · ป้าย .aw-flag เฉพาะเมื่อมีเรื่อง · แถวปกติเงียบ */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { useAdsData } from "./useAdsData.js";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { fmtMoney, fmtNum } from "../dash/charts/theme.js";
import { buildBillingModel, connectionsFromCards } from "./billingModel.js";
import { parseRuleNumber } from "../creatives/creativeRules.js";
import "./adsWorkspace.css";
import "./billingView.css";

const money = (n) => (n == null ? "—" : fmtMoney(n));
const monthIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (iso, by) => { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + by); return monthIso(d); };
/* facts โหลดย้อน 200 วัน (adsFacts.factsLoadRange) — เดือนที่เก่ากว่านั้นตารางจะว่างเพราะไม่มี cards
   ไม่ใช่เพราะไม่มีค่าแอด · ต้องบอกให้ชัด ไม่งั้นอ่านผิดว่าเดือนนั้นไม่ได้ยิงแอด */
const FACTS_WINDOW_DAYS = 200;
const STATUS_TEXT = { match: "ตรงกัน", minor: "ต่างเล็กน้อย", review: "ต้องตรวจ", nostatement: "ยังไม่กรอก", offsystem: "นอกระบบ" };
const STATUS_TONE = { match: "emerald", minor: "amber", review: "rose", nostatement: "zinc", offsystem: "rose" };

function ConfirmForm({ row, month, onSaved }) {
  const [statementText, setStatementText] = useState(row.statement != null ? String(row.statement) : "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    const statement = parseRuleNumber(statementText);
    if (Number.isNaN(statement)) { setError("ยอด statement ต้องเป็นตัวเลข เช่น 180,900"); return; }
    setSaving(true); setError(null);
    try {
      /* ไม่ส่ง reviewer — RPC ผูกชื่อจาก auth.uid() ฝั่ง server (กันปลอมชื่อคนตรวจ · security-review 22 ก.ย.) */
      await apiClient.ads.addBillingReview({
        month, external_account_id: row.external_account_id,
        verdict: statement == null && note === "" ? "match" : "noted",
        statement_amount: statement, note,
      });
      onSaved();
    } catch { setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setSaving(false); }
  };
  return <div className="bl-confirm">
    <label><span>ยอดตาม statement</span>
      <input type="text" inputMode="decimal" aria-label="ยอดตาม statement" placeholder="ไม่กรอกก็ได้ เช่น 180,900"
        value={statementText} onChange={(e) => setStatementText(e.target.value)} /></label>
    <label><span>หมายเหตุ</span>
      <input type="text" aria-label="หมายเหตุ" placeholder="เช่น เทียบ statement แล้ว"
        value={note} onChange={(e) => setNote(e.target.value)} /></label>
    {error && <p className="bl-error" role="alert">{error}</p>}
    <button type="button" disabled={saving} onClick={save}>บันทึกผลตรวจ</button>
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
  const outOfWindow = (Date.parse(`${thisMonth}T00:00:00`) - Date.parse(`${month}T00:00:00`)) / 86_400_000 > FACTS_WINDOW_DAYS;
  const model = useMemo(() => buildBillingModel({
    month, cards: ads.cards ?? [], connections: connectionsFromCards(ads.cards ?? []),
    snapshots: remote.snapshots, reviews: remote.reviews, brands: data.brands ?? [],
  }), [month, ads.cards, remote, data.brands]);

  /* การเงินบริษัท — จำกัดตามข้อเคาะ 22 ก.ย. · RLS ฝั่งฐานปิดข้อมูลอยู่แล้ว หน้านี้แค่ไม่หลอกให้กดต่อ */
  if (!isLead) return <main className="aw bl"><section className="aw-panel"><p>หน้านี้เปิดให้เฉพาะหัวหน้าทีม (team_lead)</p></section></main>;

  return <main className="aw bl">
    <section className="aw-panel">
      <div className="bl-head">
        <div>
          <h1>บิล &amp; กระทบยอดค่าแอด</h1>
          <p>ค่าแอด Meta รายเดือนเทียบ statement · ใบกำกับภาษีตัวจริงอยู่ที่ <a href="https://business.facebook.com/billing_hub/payment_activity" target="_blank" rel="noreferrer">Billing hub ของ Meta</a></p>
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
        <div><span>ระบบนับได้ · {model.rangeLabel}</span><b>{money(model.totals.spend)}</b><small>รวม {model.rows.filter((r) => r.connected).length} บัญชีที่เชื่อม</small></div>
        <div><span>VAT 7%</span><b>{money(model.totals.vat)}</b><small>ค่าประมาณ — ใบกำกับจริงที่ Billing hub</small></div>
        <div><span>รวมโดยประมาณ</span><b>{money(model.totals.gross)}</b><small>ระบบนับ + VAT</small></div>
        <div><span>ยอดค้างที่ Meta ยังไม่ตัด</span><b>{money(model.totals.balance)}</b><small>{model.totals.balance == null ? "รอ snapshot รอบแรกจาก ads-cron" : "จาก snapshot ล่าสุด"}</small></div>
      </div>

      {outOfWindow && <p className="aw-key">เดือนนี้เกินช่วงข้อมูลที่ระบบเก็บไว้ ({FACTS_WINDOW_DAYS} วันล่าสุด) — ตัวเลขค่าแอดจึงไม่ขึ้น ไม่ได้แปลว่าเดือนนั้นไม่ได้ยิงแอด</p>}
      {remote.status === "loading" && <p className="aw-key">กำลังโหลดข้อมูลบิล…</p>}
      {remote.status === "error" && <p className="aw-key">โหลดข้อมูลฝั่งฐานไม่สำเร็จ — ตัวเลขระบบนับยังถูกต้อง แต่ยอดค้าง/ผลตรวจอาจไม่ขึ้น</p>}

      <div className="bl-table" role="table" aria-label="กระทบยอดรายบัญชี">
        <div className="bl-row bl-row--head" role="row">
          <span>แบรนด์ · บัญชี</span><span className="num">ระบบนับ</span><span className="num">VAT ประมาณ</span>
          <span className="num">ยอดค้าง</span><span className="num">statement</span><span>ผลเทียบ</span><span>ผลตรวจ</span>
        </div>
        {model.rows.map((row) => <div key={row.external_account_id} data-row
          className={`bl-row-wrap${openAccount === row.external_account_id ? " is-open" : ""}`}>
          {/* กดที่ไหนก็ได้ในแถวเพื่อกางรายละเอียด (กติกาเดียวกับตารางแบรนด์หน้า Overview) */}
          <div className="bl-row" role="row" onClick={() => setOpenAccount(openAccount === row.external_account_id ? null : row.external_account_id)}>
            <span>
              <b>{row.brandName || row.accountName}</b>
              <small>{row.connected
                ? (row.accountName !== row.external_account_id ? `${row.accountName} · …${row.external_account_id.slice(-4)}` : `บัญชี …${row.external_account_id.slice(-4)}`)
                : "ยังไม่ได้เชื่อมเข้าระบบ"}</small>
            </span>
            <span className="num">{money(row.spend)}</span>
            <span className="num zinc">{money(row.vat)}</span>
            <span className={`num${row.balance == null ? " zinc" : ""}`}>{money(row.balance)}</span>
            <span className={`num${row.statement == null ? " zinc" : ""}`}>{money(row.statement)}</span>
            <span>
              <span className={STATUS_TONE[row.status]}>{STATUS_TEXT[row.status]}</span>
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
            {row.campaigns.length > 0 && <div className="bl-campaigns">
              <b>เงินก้อนนี้ไปกับอะไร</b>
              {row.campaigns.slice(0, 5).map((c) => <div key={c.name}><span>{c.name}</span><b>{money(c.spend)}</b><small className="zinc">{fmtNum(c.share * 100, 2)}%</small></div>)}
              {row.campaigns.length > 5 && <small className="zinc">อีก {row.campaigns.length - 5} แคมเปญ</small>}
            </div>}
            <ConfirmForm row={row} month={month}
              onSaved={() => { setOpenAccount(null); setReloadKey((k) => k + 1); }} />
          </div>}
        </div>)}
      </div>

      {remote.charges.length > 0 && <div className="bl-charges">
        <b>การตัดบัตรรายครั้ง (จากท่อเมลใบเสร็จ)</b>
        {remote.charges.map((c) => <div key={c.id}><span>{c.charge_date}</span><b>{money(Number(c.amount))}</b><small className="zinc">{c.reference}</small></div>)}
      </div>}

      <p className="aw-key">ระบบนับ = ผลรวมค่าแอดรายวันของเดือนจาก Meta · VAT เป็นค่าประมาณ (คำนวณ 7%) ไม่ใช่เอกสารทางการ · เกณฑ์ผลเทียบ: ≤ 0.50% ตรงกัน · ≤ 2.00% ต่างเล็กน้อย · เกิน = ต้องตรวจ · ผลตรวจเก็บแบบเพิ่มอย่างเดียว แก้ย้อนหลังไม่ได้</p>
    </section>
  </main>;
}

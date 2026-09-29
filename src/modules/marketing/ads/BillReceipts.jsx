/* รายการใบเสร็จ + หน้าต่างรายละเอียดบิล (29 ก.ย.)
   1 แถว = Meta ตัดบัตร 1 ครั้ง · กดแถว = หน้าต่างบอกว่าบิลนี้จ่ายค่าแอดวันไหน แคมเปญ/โฆษณาอะไร เท่าไร
   สถานะขึ้นเฉพาะที่ผิดปกติ (ตัดสำเร็จ = เงียบ) */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { Sheet } from "../detail/Sheet.jsx";
import { fmtNum } from "../dash/charts/theme.js";
import { BILL_KIND_TEXT, billingHubUrl } from "./billList.js";
import { billBreakdown } from "./billDetail.js";
import { coverText, dayTh, money, timeTh } from "./billFormat.js";

const KIND_TONE = { failed: "rose", declined: "rose", chargeback: "rose", refund: "amber", chargeback_reversal: "amber" };
const KIND_NOTE = {
  failed: "Meta พยายามตัดบัตรแต่ไม่สำเร็จ — ไม่มีเงินออก ตรวจบัตร/วิธีชำระเงินใน Billing hub ก่อนแอดหยุด",
  declined: "ธนาคารปฏิเสธการตัดบัตร — ไม่มีเงินออก ตรวจบัตร/วิธีชำระเงินใน Billing hub ก่อนแอดหยุด",
  refund: "Meta คืนเงินเข้าบัตร — ยอดนี้ไม่ใช่ค่าใช้จ่าย ใช้ปรับยอดกับฝ่ายบัญชี",
  chargeback: "มีการเรียกเงินคืนผ่านธนาคาร (chargeback) — Meta อาจระงับบัญชี ตรวจใน Billing hub",
  chargeback_reversal: "ยกเลิกการเรียกเงินคืน — เงินกลับไปเป็นค่าใช้จ่ายตามเดิม",
};
const COVER_FLAG = { over: ["rose", "ตัดเกินค่าแอด"], nodata: ["amber", "ค่าแอดย้อนไม่ถึง"], pending: ["amber", "รอค่าแอดวันนั้น"], vatcheck: ["amber", "เช็ก VAT"] };

/** ปุ่มคัดลอกเลขรายการ — ฝ่ายบัญชีเอาไปค้นใน Billing hub / ลงบัญชี */
function CopyRef({ value }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return undefined; const t = setTimeout(() => setDone(false), 1500); return () => clearTimeout(t); }, [done]);
  return <button type="button" className="bl-copy" aria-label={done ? "คัดลอกเลขรายการแล้ว" : `คัดลอกเลขรายการ ${value}`} title="คัดลอก"
    onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value).then(() => setDone(true), () => {}); }}>
    {done ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
  </button>;
}

/* รายการใบเสร็จ (ทำให้ง่ายลง 29 ก.ย.: "ใช้งานยาก ไม่ต้องอะไรเยอะ") — 1 แถว = 1 ปุ่ม: วันที่ · บัญชี · ยอด
   ช่วงค่าแอดที่ครอบคลุม / เลขรายการ / แคมเปญ อยู่ในหน้าต่างรายละเอียดบิล · ป้ายขึ้นเฉพาะที่ผิดปกติ
   known = รู้ค่าแอดแล้ว — ยังโหลด/พัง ระบบยังไม่รู้ว่าบัญชีไหนเชื่อม ห้ามติดป้าย "นอกระบบ" (เจอบนหน้าจริงระหว่างโหลด 29 ก.ย.) */
const FIRST_ROWS = 15;
const tagOf = (i, known) => {
  if (i.kind !== "charge") return [KIND_TONE[i.kind] ?? "rose", BILL_KIND_TEXT[i.kind] ?? i.kind];
  const cf = COVER_FLAG[i.coverStatus];
  /* ตัดเกิน / เกินถ้าไม่คิด VAT บอกยอดด้วย (ฐานเดียวกับยอดที่ตัด) */
  if (cf && (i.coverStatus === "over" || i.coverStatus === "vatcheck") && i.uncoveredGross > 0) return [cf[0], `${i.coverStatus === "over" ? "ตัดเกินค่าแอด" : "เกินถ้าไม่คิด VAT"} ${money(i.uncoveredGross)}`];
  if (cf) return cf;
  if (known && !i.connected) return ["rose", "นอกระบบ"];
  return null;
};
export function ReceiptList({ items, known = true, markFor, onOpen, emptyText }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST_ROWS);
  if (!items.length) return <p className="aw-key bl-empty">{emptyText}</p>;
  return <>
    <ul className="bl-list" aria-label="รายการบิล">
      {shown.map((i) => {
        const tag = tagOf(i, known);
        const name = i.brandName || i.accountName;
        return <li key={i.key} className={i.kind === "charge" ? "" : "is-problem"}>
          <button type="button" className="bl-item" onClick={() => onOpen(i)} aria-label={`ดูรายละเอียดบิล ${dayTh(i.date)} ${name} ${money(i.amount)}`}>
            <span className="bl-item-date"><b>{dayTh(i.date)}</b>{timeTh(i.eventTime) && <small>{timeTh(i.eventTime)} น.</small>}</span>
            <span className="bl-item-acc">{markFor(i)}<span><b>{name}</b>{i.brandName && <small>{i.accountName}</small>}</span></span>
            <span className="bl-item-tag">{tag && <span className={`aw-flag aw-flag--${tag[0]}`}>{tag[1]}</span>}</span>
            <b className="bl-item-amt">{money(i.amount)}</b>
            <ChevronRight size={16} aria-hidden="true" className="bl-item-go" />
          </button>
        </li>;
      })}
    </ul>
    {items.length > FIRST_ROWS && <button type="button" className="bl-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
      {all ? "แสดงน้อยลง" : `ดูทั้งหมด ${items.length} รายการ`}</button>}
  </>;
}

/* ---------- หน้าต่างรายละเอียดบิล ---------- */
function DayBars({ days }) {
  const max = Math.max(...days.map((d) => d.amount), 0);
  const label = days.map((d) => `${dayTh(d.day)} ${money(d.amount)}${d.whole ? "" : " (บางส่วนของวัน)"}`).join(" · ");
  return <div className="bs-days">
    <div className="bs-days-bars" role="img" aria-label={`ค่าแอดรายวันที่บิลนี้จ่าย: ${label}`}>
      {days.map((d) => <span key={d.day} className={d.whole ? "" : "is-part"} style={{ height: `${max > 0 ? Math.max(6, (d.amount / max) * 100) : 0}%` }}
        title={`${dayTh(d.day)} · ${money(d.amount)}${d.whole ? "" : ` จาก ${money(d.daySpend)}`}`} />)}
    </div>
    <div className="bs-days-axis" aria-hidden="true"><span>{dayTh(days[0].day)}</span>{days.length > 1 && <span>{dayTh(days[days.length - 1].day)}</span>}</div>
  </div>;
}

/* ภาพย่อจาก Meta หมดอายุได้ — เสียแล้วกลับเป็นอักษรแรก ไม่ปล่อยกรอบภาพแตก */
function Thumb({ ad }) {
  const [broken, setBroken] = useState(false);
  return ad.thumb && !broken ? <img src={ad.thumb} alt="" loading="lazy" onError={() => setBroken(true)} />
    : <span className="bs-thumb" aria-hidden="true">{ad.name.slice(0, 1)}</span>;
}

function CampaignBlock({ c }) {
  const top = c.ads.slice(0, 3), rest = c.ads.slice(3);
  const Ad = ({ ad }) => <li>
    <Thumb ad={ad} />
    <span><b>{ad.name}</b>{ad.adSet && <small className="zinc">{ad.adSet}</small>}</span>
    <span className="num">{money(ad.amount)}</span>
  </li>;
  return <div className="bs-camp">
    <div className="bs-camp-head"><b>{c.name}</b><span className="num">{money(c.amount)}</span><small className="zinc num">{fmtNum(c.share * 100, 2)}%</small></div>
    <div className="bs-share" aria-hidden="true"><i style={{ width: `${c.share * 100}%` }} /></div>
    <ul className="bs-ads">{top.map((ad) => <Ad key={ad.key} ad={ad} />)}</ul>
    {rest.length > 0 && <details className="bs-more"><summary>อีก {rest.length} โฆษณา</summary><ul className="bs-ads">{rest.map((ad) => <Ad key={ad.key} ad={ad} />)}</ul></details>}
  </div>;
}

export function BillSheet({ item, cards, spendKnown, dataFrom, onClose }) {
  const b = useMemo(() => billBreakdown({ item, cards: cards ?? [] }), [item, cards]);
  const name = item.brandName || item.accountName;
  const time = timeTh(item.eventTime);
  const partial = b.days.some((d) => !d.whole);
  const cover = coverText(item);
  let body;
  if (item.kind !== "charge") body = <p className="bs-note">{KIND_NOTE[item.kind] ?? "รายการนี้ไม่ใช่การตัดบัตรที่สำเร็จ"}</p>;
  else if (!item.connected) body = <p className="bs-note">บัญชีนี้ยังไม่ได้เชื่อมเข้าระบบ — ระบบไม่เห็นค่าแอดรายวันของบัญชีนี้ จึงบอกไม่ได้ว่าเงินก้อนนี้จ่ายค่าแคมเปญอะไร ดูได้ที่ Billing hub หรือเชื่อมบัญชีเข้าระบบ</p>;
  else if (!spendKnown) body = <p className="bs-note">ค่าแอดยังโหลดไม่เสร็จ (หรือหน้าหลักแสดงข้อมูลจำลอง) — ยังแตกบิลเป็นแคมเปญไม่ได้</p>;
  else if (!b.days.length) body = <p className="bs-note">ข้อมูลค่าแอดย้อนไม่ถึงช่วงที่บิลนี้จ่าย{dataFrom ? ` (ระบบมีค่าแอดตั้งแต่ ${dayTh(dataFrom)})` : ""} — บอกไม่ได้ว่าจ่ายค่าแคมเปญอะไร</p>;
  else body = <>
    <section className="bs-sec" aria-label="บิลนี้จ่ายอะไร">
      <h3>บิลนี้จ่ายค่าแอด {b.days.length} วัน{cover ? ` · ${cover}` : ""}</h3>
      <dl className="bs-split">
        <div><dt>ค่าแอด</dt><dd>{money(b.covered)}</dd></div>
        {b.vat > 0 && <div><dt>VAT ที่ Meta เก็บ</dt><dd>{money(b.vat)}</dd></div>}
        {b.unallocated > 0.004 && <div title="อยู่ในเกณฑ์ปัดเศษของการจับคู่ (≤ 0.5% หรือค่าแอดของวันที่ตัด) — ไม่ใช่ตัดเกิน"><dt>จับคู่กับค่าแอดรายวันไม่ได้ (ปัดเศษ/เวลาตัด)</dt><dd>{money(b.unallocated)}</dd></div>}
        {b.uncovered > 0.004 && <div className="amber"><dt>{item.coverStatus === "pending" ? "รอค่าแอดวันนั้นเข้าระบบ" : "ไม่มีค่าแอดที่ระบบเห็นรองรับ"}</dt><dd>{money(b.uncovered)}</dd></div>}
      </dl>
      <DayBars days={b.days} />
    </section>
    <section className="bs-sec" aria-label="แยกตามแคมเปญ">
      <h3>แยกตามแคมเปญ · โฆษณา</h3>
      {/* 5 แคมเปญแรกพอให้เห็นภาพ — ที่เหลือพับไว้ (บิลใหญ่ของ JD1 ครอบคลุม 20 แคมเปญ) */}
      {b.campaigns.slice(0, 5).map((c) => <CampaignBlock key={c.name} c={c} />)}
      {b.campaigns.length > 5 && <details className="bs-more bs-more--camp"><summary>อีก {b.campaigns.length - 5} แคมเปญ · {money(b.campaigns.slice(5).reduce((n, c) => n + Math.round(c.amount * 100), 0) / 100) /* บวกเป็นสตางค์ — กันเศษ float ถูกตัดทศนิยม */}</summary>
        {b.campaigns.slice(5).map((c) => <CampaignBlock key={c.name} c={c} />)}</details>}
      {partial && <p className="bs-foot">วันที่บิลจ่ายแค่บางส่วน (ตัดบัตรกลางวัน) แบ่งให้โฆษณาตามสัดส่วนค่าแอดของวันนั้น — เป็นค่าประมาณ</p>}
    </section>
  </>;

  return <Sheet eyebrow={`ใบเสร็จ Meta · ${dayTh(item.date)}${time ? ` ${time} น.` : ""}`} title={`${name} · ${money(item.amount)}`} onClose={onClose}>
    <dl className="bs-facts">
      <div><dt>บัญชี</dt><dd>{item.accountName} <span className="zinc">…{item.accountId.slice(-4)}</span>{!item.connected && <span className="aw-flag aw-flag--rose">นอกระบบ</span>}</dd></div>
      <div><dt>สถานะ</dt><dd className={item.kind === "charge" ? "" : "rose"}>{BILL_KIND_TEXT[item.kind] ?? item.kind}</dd></div>
      <div><dt>เลขรายการ</dt><dd className="bs-ref">{item.transactionId ? <>{item.transactionId}<CopyRef value={item.transactionId} /></> : "—"}</dd></div>
      <div><dt>ใบเสร็จตัวจริง</dt><dd><a href={billingHubUrl(item.accountId)} target="_blank" rel="noreferrer">เปิดใน Billing hub <ExternalLink size={12} aria-hidden="true" /></a></dd></div>
    </dl>
    {body}
  </Sheet>;
}

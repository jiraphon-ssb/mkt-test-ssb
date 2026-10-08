/* นำเข้าค่าแอดจากไฟล์ (ChatGPT ads — OpenAI ยังไม่เปิด API ให้ดึงยอด)
   spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md

   กติกาแกนกลางของหน้านี้: **เลือกไฟล์แล้วยังไม่เขียน** — ขึ้นสรุปให้ตรวจก่อนเสมอ
   เพราะไฟล์ผิดบัญชี/ผิดช่วงวัน เขียนทับไปแล้วรู้ตัวทีหลังคือหายนะ */
import { useState } from "react";
import { FileUp, TriangleAlert, Upload } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { parseSpendCsv } from "./importCsv.js";
import { buildImportPayload, fileHashOf, importPreview } from "./importModel.js";
import { adsErrorText } from "./adsSyncMessages.js";
import { dayTh, money } from "./billFormat.js";

const PROVIDER_LABEL = { openai: "ChatGPT Ads", google: "Google Ads" };

export function ImportSpendPanel({ connections = [], batches = [], importFn, loadExisting, onImported }) {
  const runImport = importFn ?? apiClient.ads.importFacts;
  const fetchExisting = loadExisting ?? (async () => []);
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [staged, setStaged] = useState(null);   // { fileName, hash, rows, parse, preview, seenBefore }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const connection = connections.find((item) => item.id === connectionId) ?? connections[0] ?? null;

  if (connections.length === 0) {
    return <section className="imp" aria-label="นำเข้าค่าแอดจากไฟล์">
      <header className="imp-head"><FileUp size={16} /><h3>นำเข้าค่าแอดจากไฟล์</h3></header>
      <p className="imp-empty">ยังไม่มีบัญชีที่ป้อนข้อมูลด้วยไฟล์ — เพิ่มบัญชีก่อน แล้วค่อยอัปไฟล์จาก Ads Manager</p>
    </section>;
  }

  const onPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";                 // เลือกไฟล์เดิมซ้ำได้
    if (!file || !connection) return;
    setError(null); setDone(null); setBusy(true);
    try {
      const text = await file.text();
      const parse = parseSpendCsv(text, connection.provider);
      if (parse.rows.length === 0) { setStaged({ fileName: file.name, parse, rows: [], hash: null, preview: null, seenBefore: null }); return; }
      const hash = await fileHashOf(text);
      const existing = await fetchExisting(connection.id, parse.rows[0].fact_date, parse.rows[parse.rows.length - 1].fact_date);
      setStaged({
        fileName: file.name, hash, parse, rows: parse.rows,
        preview: importPreview({ rows: parse.rows, existing }),
        seenBefore: batches.find((batch) => batch.file_hash === hash) ?? null,
      });
    } catch (readError) {
      setError(adsErrorText(readError, "อ่านไฟล์ไม่สำเร็จ"));
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!staged?.rows.length || !connection) return;
    setBusy(true); setError(null);
    try {
      const payload = buildImportPayload({
        provider: connection.provider, connectionId: connection.id,
        fileName: staged.fileName, fileHash: staged.hash, rows: staged.rows,
      });
      const result = await runImport(payload);
      setDone(result); setStaged(null);
      onImported?.(result);
    } catch (importError) {
      setError(adsErrorText(importError, "นำเข้าไม่สำเร็จ — ยอดเดิมยังอยู่ครบ"));
    } finally { setBusy(false); }
  };

  const p = staged?.preview;
  return <section className="imp" aria-label="นำเข้าค่าแอดจากไฟล์">
    <header className="imp-head">
      <FileUp size={16} /><h3>นำเข้าค่าแอดจากไฟล์</h3>
      <small>{PROVIDER_LABEL[connection?.provider] ?? connection?.provider}</small>
    </header>

    <div className="imp-pick">
      <label className="imp-field">
        <span>บัญชี</span>
        <Dropdown className="dd--block" ariaLabel="บัญชีที่จะนำเข้า"
          options={connections.map((item) => [item.id, item.brand_name ? `${item.brand_name} · ${item.account_name}` : item.account_name])}
          value={connection?.id ?? ""} onChange={(value) => { setConnectionId(value); setStaged(null); setDone(null); }} />
      </label>
      <label className="imp-file">
        <input type="file" accept=".csv,text/csv" onChange={onPick} disabled={busy} />
        <span><Upload size={14} /> เลือกไฟล์ CSV</span>
      </label>
    </div>

    {staged?.parse?.errors?.length > 0 && <ul className="imp-errors" role="alert">
      {staged.parse.errors.map((message) => <li key={message}>{message}</li>)}
    </ul>}

    {p && <div className="imp-review" role="group" aria-label="ตรวจก่อนนำเข้า">
      <h4>ตรวจก่อนนำเข้า · {staged.fileName}</h4>
      <dl className="imp-sum">
        <div><dt>ช่วงวัน</dt><dd>{dayTh(p.from)} – {dayTh(p.to)}</dd></div>
        <div><dt>จำนวนวัน</dt><dd>{p.dayCount} วัน</dd></div>
        <div><dt>ยอดรวม</dt><dd className="imp-total">{money(p.spendTotal)}</dd></div>
        <div><dt>ทับของเดิม</dt><dd>{p.overwrites > 0 ? `${p.overwrites} วัน` : "ไม่มี"}</dd></div>
      </dl>
      {staged.parse.mergedDays > 0 && <p className="imp-note">รวมหลายแคมเปญเป็นยอดรายวันแล้ว {staged.parse.mergedDays} วัน</p>}
      {staged.parse.skipped > 0 && <p className="imp-note">ข้าม {staged.parse.skipped} แถวที่ไม่มีค่าแอด (ไม่นับเป็นศูนย์)</p>}
      {p.missingDays.length > 0 && <p className="imp-warn"><TriangleAlert size={14} /> ช่วงนี้ไม่มีข้อมูล {p.missingDays.length} วัน: {p.missingDays.map(dayTh).join(" · ")}</p>}
      {staged.seenBefore && <p className="imp-warn"><TriangleAlert size={14} /> เคยอัปไฟล์นี้แล้วเมื่อ {dayTh(String(staged.seenBefore.created_at).slice(0, 10))} — อัปซ้ำได้ ยอดไม่บวกซ้ำ</p>}
      <div className="imp-actions">
        <button type="button" className="imp-confirm" onClick={confirm} disabled={busy}>{busy ? "กำลังนำเข้า…" : "ยืนยันนำเข้า"}</button>
        <button type="button" className="imp-cancel" onClick={() => setStaged(null)} disabled={busy}>ยกเลิก</button>
      </div>
    </div>}

    {done && <p className="imp-done" role="status">นำเข้าแล้ว — เพิ่มใหม่ {done.inserted ?? 0} วัน · ทับของเดิม {done.updated ?? 0} วัน</p>}
    {error && <p className="imp-errors" role="alert">{error}</p>}
  </section>;
}

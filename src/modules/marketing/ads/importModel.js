/* นำเข้าค่าแอดจากไฟล์ — สรุปก่อนยืนยัน + payload ของ RPC mkt_ads_import_facts (pure · ไม่ยุ่ง network/DOM)
   spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md

   ตัดคอลัมน์ที่ไม่เกี่ยวทิ้งที่นี่ที่เดียว — ไฟล์จาก Ads Manager มีชื่อแคมเปญและคอลัมน์อื่นที่ไม่ควรขึ้นฐานข้อมูล
   (ขอบเขตที่ตกลงคือค่าแอดรายวันต่อบัญชีเท่านั้น) */

const DAY_MS = 86_400_000;
/* ตัดสตางค์แบบไม่ปัด ตามกติกาเงินของโปรเจกต์ (fmtMoney/trunc2) — ยอดที่โชว์กับยอดที่บันทึกต้องตรงกัน */
const money2 = (n) => Math.trunc(Number(n) * 100) / 100;
const dayList = (from, to) => {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};

/** แถวที่แกะได้ + ข้อมูลไฟล์ → { batch, rows } ที่ส่งเข้า RPC ได้ตรงๆ */
export function buildImportPayload({ provider, connectionId, fileName, fileHash, importedBy, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("ไม่มีแถวให้นำเข้า");
  const dates = rows.map((r) => r.fact_date).sort();
  return {
    batch: {
      provider,
      connection_id: connectionId,
      file_name: fileName ?? "",
      file_hash: fileHash,
      date_from: dates[0],
      date_to: dates[dates.length - 1],
      row_count: rows.length,
      spend_total: money2(rows.reduce((n, r) => n + Number(r.spend), 0)),
      imported_by: importedBy ?? null,
    },
    rows: rows.map((r) => ({ fact_date: r.fact_date, spend: r.spend })),
  };
}

/** เทียบกับของที่มีอยู่แล้ว → บอกคนกดว่ากำลังจะทับอะไร และไฟล์ขาดวันไหนไปบ้าง ก่อนเขียนจริง */
export function importPreview({ rows, existing = [] }) {
  const have = new Set(existing.map((f) => f.fact_date));
  const days = rows.map((r) => r.fact_date).sort();
  const from = days[0], to = days[days.length - 1];
  return {
    from, to,
    dayCount: rows.length,
    spendTotal: money2(rows.reduce((n, r) => n + Number(r.spend), 0)),
    overwrites: rows.filter((r) => have.has(r.fact_date)).length,
    // วันที่อยู่ในช่วงแต่ไม่มีในไฟล์ — ต้องเห็นก่อนกดยืนยัน ไม่งั้นยอดเดือนจะขาดโดยไม่มีใครรู้
    missingDays: dayList(from, to).filter((d) => !days.includes(d)),
  };
}

/** ลายนิ้วมือไฟล์ (sha256) — ใช้เตือนเมื่ออัปไฟล์เดิมซ้ำ · ไม่เก็บตัวไฟล์ขึ้นระบบ */
export async function fileHashOf(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

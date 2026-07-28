/* Minimal dependency-free XLSX reader (enough for bank-statement exports).
   XLSX = a ZIP of XML. We read the ZIP central directory (robust vs data
   descriptors), inflate the two parts we need with the browser's built-in
   DecompressionStream('deflate-raw'), and walk the sheet XML with DOMParser.
   parseXlsx(arrayBuffer) → Promise<string[][]>  (row-major, col 0-indexed). */

const dv = (buf) => new DataView(buf);
const u32 = (view, off) => view.getUint32(off, true);
const u16 = (view, off) => view.getUint16(off, true);

async function inflateRaw(u8) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("เบราว์เซอร์นี้อ่านไฟล์ XLSX ไม่ได้ (ไม่รองรับ DecompressionStream) — ลอง Chrome/Safari เวอร์ชันใหม่ หรือ Save As .csv");
  }
  const ds = new DecompressionStream("deflate-raw");
  const ab = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}

// read the ZIP central directory → { name: {method, offset, compSize} }
function readCentralDir(buf) {
  const view = dv(buf);
  const len = buf.byteLength;
  // find End Of Central Directory (0x06054b50), scanning back over the (usually empty) comment
  let eocd = -1;
  for (let i = len - 22; i >= 0 && i >= len - 22 - 65536; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ไฟล์ไม่ใช่ XLSX ที่ถูกต้อง (ไม่พบ ZIP directory)");
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);           // central dir offset
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOff = u32(view, p + 42);
    const name = new TextDecoder("utf-8").decode(new Uint8Array(buf, p + 46, nameLen));
    entries[name] = { method, compSize, localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf, entry) {
  const view = dv(buf);
  // recompute data start from the LOCAL header (name/extra lengths there can differ)
  const lo = entry.localOff;
  if (u32(view, lo) !== 0x04034b50) throw new Error("ZIP local header เสีย");
  const nameLen = u16(view, lo + 26);
  const extraLen = u16(view, lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const bytes = new Uint8Array(buf, dataStart, entry.compSize);
  const raw = entry.method === 0 ? bytes : await inflateRaw(bytes);
  return new TextDecoder("utf-8").decode(raw);
}

const colToIndex = (ref) => {
  const m = /^([A-Z]+)/.exec(ref);
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;                            // 0-indexed
};

function textOf(el) {
  // concat every <t> descendant (handles rich-text runs)
  return Array.from(el.getElementsByTagName("t")).map((t) => t.textContent || "").join("");
}

export async function parseXlsx(arrayBuffer) {
  const buf = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : arrayBuffer.buffer;
  const entries = readCentralDir(buf);

  // shared strings
  const shared = [];
  if (entries["xl/sharedStrings.xml"]) {
    const doc = new DOMParser().parseFromString(await readEntry(buf, entries["xl/sharedStrings.xml"]), "application/xml");
    for (const si of doc.getElementsByTagName("si")) shared.push(textOf(si));
  }

  // first worksheet (sheet1 for the SCB export; fall back to any worksheet)
  const sheetName =
    entries["xl/worksheets/sheet1.xml"] ? "xl/worksheets/sheet1.xml"
    : Object.keys(entries).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetName) throw new Error("ไม่พบชีตในไฟล์ XLSX");
  const sheet = new DOMParser().parseFromString(await readEntry(buf, entries[sheetName]), "application/xml");

  const rows = [];
  for (const row of sheet.getElementsByTagName("row")) {
    const cells = [];
    let maxCol = -1;
    for (const c of row.getElementsByTagName("c")) {
      const idx = colToIndex(c.getAttribute("r") || "A1");
      const t = c.getAttribute("t");
      let val = "";
      if (t === "s") {
        const v = c.getElementsByTagName("v")[0];
        val = v ? shared[parseInt(v.textContent, 10)] || "" : "";
      } else if (t === "inlineStr") {
        const is = c.getElementsByTagName("is")[0];
        val = is ? textOf(is) : "";
      } else {
        const v = c.getElementsByTagName("v")[0];
        val = v ? v.textContent || "" : "";
      }
      cells[idx] = val;
      if (idx > maxCol) maxCol = idx;
    }
    for (let i = 0; i <= maxCol; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

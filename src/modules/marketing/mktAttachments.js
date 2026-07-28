/* ============================================================
 กติกาไฟล์แนบ + ลิงก์อ้างอิง (pure — test ได้)
 ============================================================ */
/* ---------- ไฟล์เอกสาร ---------- */
export const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip"];
export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
export const MAX_DOC_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export function extOf(name) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}
export function formatBytes(n) {
  if (n < 1024)
    return `${n} B`;
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
/** ตรวจก่อนอัปโหลด — ประเภท + ขนาด */
export function checkFile(file, kind) {
  const ext = extOf(file.name);
  const allowed = kind === "image" ? IMAGE_EXT : DOC_EXT;
  const max = kind === "image" ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (!allowed.includes(ext)) {
    return { ok: false, error: `รองรับเฉพาะ ${allowed.join(", ").toUpperCase()}` };
  }
  if (file.size > max) {
    return { ok: false, error: `ไฟล์ใหญ่เกิน ${formatBytes(max)}` };
  }
  if (file.size === 0) {
    return { ok: false, error: "ไฟล์ว่าง" };
  }
  return { ok: true };
}
/* ---------- ลิงก์ ---------- */
/** ตรวจ URL — ต้องเป็น http/https ที่ parse ได้ */
export function isValidUrl(raw) {
  const s = raw.trim();
  if (!s)
    return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  }
  catch {
    return false;
  }
}
/** เติม https:// ให้ถ้าผู้ใช้พิมพ์แค่ domain */
export function normalizeUrl(raw) {
  const s = raw.trim();
  if (!s)
    return s;
  if (/^https?:\/\//i.test(s))
    return s;
  return `https://${s}`;
}
/** เดาประเภทลิงก์จาก hostname — ลดงานกรอกของผู้ใช้ */
export function detectLinkType(url) {
  let host = "";
  try {
    host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, "").toLowerCase();
  }
  catch {
    return "other";
  }
  if (host.includes("facebook.") || host.includes("fb."))
    return "facebook";
  if (host.includes("tiktok."))
    return "tiktok";
  if (host.includes("youtube.") || host === "youtu.be")
    return "youtube";
  if (host.includes("drive.google.") || host.includes("docs.google."))
    return "google_drive";
  if (host.includes("figma."))
    return "figma";
  if (host.includes("canva."))
    return "canva";
  return "website";
}
/** ชื่อโดเมนสั้นๆ ใช้เป็น title เริ่มต้น */
export function hostLabel(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  }
  catch {
    return url;
  }
}

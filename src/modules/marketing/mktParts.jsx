import { PILLAR_LABEL } from "./mktEngine.js";
import { timelineSummary, albumFrames, frameComplete, isAlbum } from "./mktRules.js";
export function brandOf(data, id) {
  return data.brands.find((b) => b.id === id) ?? data.brands[0];
}
export function profileOf(data, id) {
  return data.profiles.find((p) => p.id === id);
}
export function BrandTag({ brand }) {
  return <span className="tag brand" style={brandFill(brand.color)}>{brand.name}</span>;
}
export function PillarTag({ card }) {
  if (card.track === "project")
    return <span className="tag proj">Project</span>;
  if (!card.pillar)
    return null;
  return <span className="tag pillar">{PILLAR_LABEL[card.pillar]}</span>;
}
const AVATAR_BG = ["#4B5A6B", "#5E6E52", "#7A5C52", "#4E6A78", "#6E5470", "#5B5E8A", "#6B6152"];
function avatarColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}
/** avatar แบบ monogram ตัวอักษรย่อ — สีคงที่ต่อคน */
export function Avatar({ profile, size = 40 }) {
  const label = profile?.display_name?.[0] ?? "?";
  return (<div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      border: "2px solid var(--surface)",   /* ขอบต้องเป็นสีพื้นการ์ด ไม่ใช่ขาวตายตัว */
      background: profile ? avatarColor(profile.id) : "var(--ink-faint)",
      color: "#fff",
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      fontWeight: 600,
      fontSize: size * 0.42,
    }}>
   {label}
  </div>);
}
export function fmtDayMonth(iso) {
  if (!iso)
    return "—";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
export function fmtDateTime(iso) {
  if (!iso)
    return "—";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
}
/* วันที่แบบไทย อ่านง่าย — เดือนย่อไทย + พ.ศ. 2 หลัก (คนไทยอ่านเร็วกว่า d/m) */
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function fmtThai(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MON[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, "0")}`;
}
export function fmtThaiDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtThai(iso)} · ${hh}:${mm} น.`;
}

/* ── ป้ายพื้นสีแบรนด์ ─────────────────────────────────────────────────────────
   สีแบรนด์ไม่ได้อยู่ใน palette ของ SSB — ผู้ใช้ตั้งเองใน Admin จึงเลือกสีตัวอักษร
   ตายตัวไม่ได้ คำนวณ relative luminance ตาม WCAG แล้วเลือกขาว/ink ที่อ่านชัดกว่า
   (ใช้ #1C232E ตัวเดียวกับ ink ของธีมสว่าง SSB) */
const srgb = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lumOf = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);

export function brandFill(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return { background: "var(--accent)", color: "var(--on-accent)" };
  const L = lumOf([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const withWhite = 1.05 / (L + 0.05);
  const withInk = (L + 0.05) / 0.0722;        // #1C232E ≈ L 0.0222
  return { background: hex, color: withWhite >= withInk ? "#fff" : "#1C232E" };
}

/* ── ป้ายชนิดชิ้นงาน ───────────────────────────────────────────────────────────
   ใช้ร่วมทุกจอ (บอร์ด/รอตรวจ/ปฏิทิน) ให้พูดภาษาเดียวกัน — AW / ALBUM n/m / VIDEO วิ·ฉาก
   ยังไม่ครบ = จุดเตือน (warn-dot) เห็นได้ตั้งแต่บนการ์ดว่าบรีฟยังไม่จบ */
export function TypeTag({ brief }) {
  if (brief.format === "video") {
    const tl = timelineSummary(brief);
    return (<span className={`tag video ${tl.ok ? "" : "warn-dot"}`}>
      VIDEO · {brief.video_seconds ?? "?"}s · {tl.count} ฉาก
    </span>);
  }
  if (isAlbum(brief)) {
    const frames = albumFrames(brief);
    const filled = frames.filter(frameComplete).length;
    const ok = filled === frames.length && frames.length >= 2;
    return (<span className={`tag album ${ok ? "" : "warn-dot"}`}>
      ALBUM · {filled}/{frames.length} ภาพ
    </span>);
  }
  return <span className="tag">AW · {brief.size || "ยังไม่ระบุขนาด"}</span>;
}

/** ชนิดงานเป็นข้อความสั้น (สำหรับ meta line ของการ์ด — ไม่ใช่ pill) */
export function typeText(brief) {
  if (brief.format === "video") {
    /* งานเก่าที่ไม่มีสเปค — โชว์แค่ "VIDEO" ไม่ใช่ "?s · 0 ฉาก" */
    const n = timelineSummary(brief).count;
    return `VIDEO${brief.video_seconds ? ` ${brief.video_seconds}s` : ""}${n > 0 ? ` · ${n} ฉาก` : ""}`;
  }
  if (isAlbum(brief)) {
    const f = albumFrames(brief);
    return `ALBUM ${f.filter(frameComplete).length}/${f.length}`;
  }
  return `AW${brief.size ? " · " + brief.size : ""}`;
}
/** ไอคอนประจำชนิดงาน (คู่กับ typeText) — video / layers(ชุดภาพ) / image(AW) */
export function typeIcon(brief) {
  if (brief.format === "video") return "video";
  if (isAlbum(brief)) return "layers";
  return "image";
}
/** ชนิดงานยังกรอกไม่ครบไหม (คลิป/ชุดภาพ) — ใช้จุดเตือนเล็ก */
export function typeIncomplete(brief) {
  if (brief.format === "video") return !timelineSummary(brief).ok;
  if (isAlbum(brief)) { const f = albumFrames(brief); return f.filter(frameComplete).length !== f.length || f.length < 2; }
  return false;
}

/* ── รูปหน้าปกของการ์ด ─────────────────────────────────────────────────────────
   ลำดับ: รูปไฟล์แนบที่ preview ได้ → ลิงก์ Google Drive จริงแปลงเป็น thumbnail
   เดโมลิงก์เป็น mock จึงตกมาที่ไฟล์แนบเป็นหลัก · ลิงก์ไดร์ฟจริงที่แชร์ public จะขึ้นเอง
   เวอร์ชันจริงควรใช้ Drive API หรือ og:image แทนการเดา id */
export function driveThumb(url) {
  const m = String(url || "").match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600` : null;
}
/**
 * @param {object} card
 * @param {object} data       สโตร์ทั้งก้อน (อ่าน attachments)
 * @param {(a:any)=>string|undefined} urlOf  ตัวแปลง attachment → URL (ส่งมาเลี่ยง import วน)
 */
export function coverImage(card, data, urlOf) {
  const imgs = (data.attachments ?? [])
    .filter((a) => a.card_id === card.id && a.mime_type?.startsWith("image/"))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  /* งานจริงมาก่อน (คนอยากเห็นชิ้นงาน) → แล้วค่อย brief/ref */
  const rank = (a) => (a.attachment_type === "draft_work" ? 0 : 1);
  const img = [...imgs].sort((a, b) => rank(a) - rank(b)).map(urlOf).find(Boolean);
  if (img) return img;
  return driveThumb(card.draft_link) ?? driveThumb(card.post_link) ?? driveThumb(card.brief?.ci_link);
}

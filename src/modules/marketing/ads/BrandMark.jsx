/* ============================================================
   BrandMark — เครื่องหมายประจำแบรนด์
   มีไฟล์โลโก้ (brand.logo) → ใช้โลโก้จริง · ยังไม่มี → monogram จากชื่อ + สีแบรนด์
   ไม่วาดโลโก้เลียนแบบเอง เพราะโลโก้ที่ "เกือบเหมือน" ทำลายแบรนด์มากกว่าไม่มี
   ============================================================ */

const BUILT_IN_BRAND_LOGOS = {
  b_td: "/brand-logos/teamdee.jpg",
  b_jk: "/brand-logos/jk-design.jpg",
  b_ta: "/brand-logos/t-around.jpg",
  b_jt: "/brand-logos/juntakarn.jpg",
};

/** ตัวอักษรย่อจากชื่อแบรนด์ — คงตัวพิมพ์ตามต้นฉบับ ("t around" → "ta", "TEAMDEE" → "TE") */
export function monogramOf(name = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  /* คำแรกเป็นตัวย่ออยู่แล้ว ("JK Design") → ใช้ตัวย่อนั้น ไม่ใช่ J+D */
  if (words[0].length >= 2 && words[0].length <= 3 && words[0] === words[0].toUpperCase()) {
    return words[0].slice(0, 2);
  }
  if (words.length >= 2) return words[0][0] + words[1][0];
  return words[0].slice(0, 2);
}

/** ความสว่างของสี (WCAG relative luminance) — ใช้เลือกสีตัวอักษรให้อ่านออกจริง
    สีแบรนด์บางตัว (ส้ม) ตัวหนังสือขาวได้คอนทราสต์แค่ ~3:1 ซึ่งไม่ผ่าน AA */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** สีตัวอักษรบนพื้นสีแบรนด์ — คิดคอนทราสต์จริงทั้งสองทางแล้วเลือกอันที่สูงกว่า
    (เดาเป็น threshold ความสว่างจะพลาดกับสีอิ่มตัวอย่างส้ม: ตัวขาวได้แค่ ~2.9:1) */
export function inkOn(hex) {
  const L = luminance(hex);
  const vsWhite = 1.05 / (L + 0.05);
  const vsDark = (L + 0.05) / (luminance("#11181C") + 0.05);
  return vsDark >= vsWhite ? "#11181C" : "#FFFFFF";
}

export function BrandMark({ brand, size = 34 }) {
  const color = brand.color || "var(--ink-soft)";
  const logo = brand.logo || BUILT_IN_BRAND_LOGOS[brand.id];
  if (logo) {
    return (
      <img className="ads-brandmark ads-brandmark--image" src={logo} alt={`โลโก้ ${brand.name}`}
        width={size} height={size} style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="ads-brandmark ads-brandmark--mono" aria-hidden="true"
      style={{ width: size, height: size, background: color, color: inkOn(brand.color),
        fontSize: Math.round(size * 0.38) }}>
      {monogramOf(brand.name)}
    </span>
  );
}

/* ============================================================
 Export CSV ของงานที่วัดผลแล้ว — ใช้ร่วมทั้ง Admin และหน้าผลตอบรับ
 นิยามคอลัมน์ล็อกตาม Report Template กลาง (ห้ามแก้ลำดับตามใจ)
 ============================================================ */
import { brandAverageER, engagementRate, resultLabel } from "./mktRules.js";
export const MEASURED_CSV_HEAD = [
  "card_id", "post_date", "brand", "pillar", "track", "format", "channels",
  "is_realtime", "reach", "engagement", "leads", "spend", "cpl", "er_percent", "result_label",
];
const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** สร้างเนื้อไฟล์ CSV (มี BOM ให้ Excel อ่านภาษาไทยถูก) จากการ์ดที่ส่งเข้ามา */
export function measuredCsv(cards, data) {
  const body = cards.map((c) => {
    const er = engagementRate(c.metrics);
    const label = resultLabel(c, brandAverageER(data.cards, c.brand_id, c.id));
    return [
      c.id,
      c.brief.publish_at ?? "",
      data.brands.find((b) => b.id === c.brand_id)?.name ?? "",
      c.pillar ?? "",
      c.track,
      c.brief.format,
      c.brief.channels.join("|"),
      c.is_realtime ? "yes" : "no",
      c.metrics?.reach ?? "",
      c.metrics?.engagement ?? "",
      c.metrics?.leads ?? "",
      c.metrics?.spend ?? "",
      c.metrics?.cpl ?? "",
      er == null ? "" : (er * 100).toFixed(2),
      label ?? "",
    ].map(esc).join(",");
  });
  return "﻿" + [MEASURED_CSV_HEAD.join(","), ...body].join("\n");
}
/** ดาวน์โหลดไฟล์จากเบราว์เซอร์ (ไม่มี backend — เดโมสร้างไฟล์ฝั่ง client) */
export function downloadFile(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

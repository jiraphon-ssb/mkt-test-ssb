/* ส่วนสื่อของการ์ด Creative (pure · เทสใน tests/creativeMedia.test.js) — รายการภาพ ป้าย และการเลื่อนภาพ */
const LABEL = { video: "วิดีโอ", image: "ภาพ", carousel: "ชุดภาพ", none: "ไม่มีภาพ" };
export const SWIPE_THRESHOLD = 40;

export function mediaView(asset) {
  const all = (asset?.media ?? [])
    .map((item) => ({ src: item?.thumbnailUrl || item?.imageUrl || null, type: item?.type === "video" ? "video" : "image" }))
    .filter((item) => item.src);
  /* ภาพซ้ำ URL เดียวกันในชุดเดียวนับเป็นภาพเดียว — ของจริงเคยเจออัลบั้ม 8 ชิ้นที่ Meta ส่ง image_hash มาอย่างเดียว
     ทุกชิ้นเลยตกไปใช้ภาพระดับ creative ตัวเดียวกัน ตัวนับวิ่ง 1/8 แต่ภาพไม่เปลี่ยน คนกดแล้วงงว่าพัง
     บอกตามจริงว่ามีภาพเดียวดีกว่าโชว์ตัวนับหลอก (ต้นเหตุแก้ที่ worker — ดู hashesNeedingUrl ใน metaCreative.js) */
  const items = all.filter((item, index) => all.findIndex((other) => other.src === item.src) === index);
  const count = items.length;
  const isVideo = asset?.format === "video" || items[0]?.type === "video";
  const kind = !count ? "none" : count > 1 ? "carousel" : isVideo ? "video" : "image";
  return {
    kind,
    count,
    label: kind === "carousel" && count > 1 ? `${LABEL.carousel} · ${count}` : LABEL[kind],
    key: [count, items[0]?.src, count > 1 ? items[count - 1].src : null].filter((part) => part != null).join("|"),   // ชุดภาพเปลี่ยน → กลับภาพแรก
    items,
  };
}

export const clampIndex = (index, count) => (count <= 0 ? 0 : Math.min(count - 1, Math.max(0, index)));

/** ปัดบนจอสัมผัส: แนวนอนเด่นกว่าแนวตั้งและไกลพอ → +1 ถัดไป / -1 ก่อนหน้า · อย่างอื่น 0 (ปล่อยให้เลื่อนหน้า) */
export function swipeStep(dx, dy, threshold = SWIPE_THRESHOLD) {
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

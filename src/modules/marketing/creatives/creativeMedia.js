/* ส่วนสื่อของการ์ด Creative (pure · เทสใน tests/creativeMedia.test.js) — เลือกภาพ ป้าย และสถานะที่หน้าจอแสดง */
const LABEL = { video: "วิดีโอ", image: "ภาพ", carousel: "ชุดภาพ", none: "ไม่มีภาพ" };

export function mediaView(asset) {
  const media = (asset?.media ?? []).filter((item) => item?.thumbnailUrl || item?.imageUrl);
  const first = media[0] ?? null;
  const src = first ? first.thumbnailUrl || first.imageUrl : null;
  const count = media.length;
  const isVideo = asset?.format === "video" || first?.type === "video";
  const kind = !src ? "none" : count > 1 || asset?.format === "carousel" ? "carousel" : isVideo ? "video" : "image";
  return {
    kind,
    src,
    count,
    label: kind === "carousel" && count > 1 ? `${LABEL.carousel} · ${count}` : LABEL[kind],
    fromPage: first?.source === "creative",   // มีแค่ภาพย่อระดับ creative = มักเป็นรูปโปรไฟล์เพจ
  };
}

/* ตัวอย่างโฆษณาจริงจาก Meta — iframe ของ Meta เล่นคลิป/ภาพตามตำแหน่งที่ลูกค้าเห็น
   src มาจาก Edge Function ads-preview (ตรวจแล้วฝั่ง server) และตรวจซ้ำที่นี่ก่อนใส่ iframe · ไม่ใช้ HTML จาก Meta */
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { adsErrorText } from "../ads/adsSyncMessages.js";
import { isPreviewSrc } from "../ads/metaCreativeContract.js";
import "./creativePreview.css";

const FORMATS = [
  ["MOBILE_FEED_STANDARD", "Facebook มือถือ", 690],
  ["DESKTOP_FEED_STANDARD", "Facebook คอม", 640],
  ["INSTAGRAM_STANDARD", "Instagram ฟีด", 720],
  ["INSTAGRAM_STORY", "Instagram สตอรี่", 640],
];
const cache = new Map();   // adId|format → src (ลิงก์ของ Meta มีอายุ ใช้ซ้ำในหน้าเดียวกันพอ)

/** ตัวอย่างโฆษณาจริงจาก Meta แบบฝังในหน้าต่างอื่น (ไม่มีฉากหลัง/ปุ่มปิดของตัวเอง) — หน้าต่างครีเอทีฟใช้เป็นแท็บ (สเปก 2026-09-25)
    src มาจาก ads-preview และตรวจซ้ำด้วย isPreviewSrc ก่อนใส่ iframe เหมือนเดิม */
export function MetaPreviewPane({ row }) {
  const asset = row.asset;
  const [format, setFormat] = useState(FORMATS[0][0]);
  const [state, setState] = useState({ status: "loading", src: null, error: null });

  useEffect(() => {
    let alive = true;
    const key = `${asset.adId}|${format}`;
    if (cache.has(key)) { setState({ status: "ready", src: cache.get(key), error: null }); return undefined; }
    setState({ status: "loading", src: null, error: null });
    apiClient.ads.creativePreview(asset.connectionId, asset.adId, format)
      .then((data) => {
        if (!alive) return;
        if (!isPreviewSrc(data?.src)) throw Object.assign(new Error("PREVIEW_UNAVAILABLE"), { code: "PREVIEW_UNAVAILABLE" });
        cache.set(key, data.src);
        setState({ status: "ready", src: data.src, error: null });
      })
      .catch((error) => { if (alive) setState({ status: "error", src: null, error }); });
    return () => { alive = false; };
  }, [asset.adId, asset.connectionId, format]);

  const height = FORMATS.find(([key]) => key === format)?.[2] ?? 690;
  return <div className="cl-preview-pane">
    <div className="cl-preview-formats" role="tablist" aria-label="ตำแหน่งที่แสดงโฆษณา">
        {FORMATS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={format === key} className={format === key ? "active" : ""} onClick={() => setFormat(key)}>{label}</button>)}
      </div>
    <div className="cl-preview-frame" style={{ minHeight: Math.min(height, 720) }}>
          {state.status === "loading" && <div className="cl-preview-state" role="status"><LoaderCircle size={20} className="spin" /><span>กำลังโหลดตัวอย่างจาก Meta…</span></div>}
          {state.status === "error" && <div className="cl-preview-state bad" role="alert"><strong>แสดงตัวอย่างไม่ได้</strong><span>{adsErrorText(state.error, "ลองตำแหน่งอื่นหรือกดดึงข้อมูลใหม่")}</span></div>}
          {state.status === "ready" && <iframe key={state.src} src={state.src} title={`ตัวอย่างโฆษณา ${row.creative}`} width="540" height={height} loading="lazy" referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />}
        </div>
  </div>;
}

/* useAdsData — แหล่งการ์ดแอดของทุกหน้า ads (ภาพรวม · แคมเปญ · Creative)
   Meta Pilot = ยอดจริงจาก ad_daily_facts — เป็นค่าเริ่มของทุกคนที่ล็อกอินจริง · ข้อมูลจำลองเหลือไว้ให้ team_lead สลับดูตอนสาธิต และโหมดเดโม
   ตัวเลือกจำไว้ในเครื่อง (localStorage) · ยอดจริงเก็บใน cache ระดับโมดูล ไม่โหลดซ้ำทุกครั้งที่สลับหน้า */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { useApp } from "../useMkt.jsx";
import { isoDay } from "../adsScope.js";
import { adsCardsForSource, adsSourceAccess, factsLoadRange, factsToAdCards, normalizeAdsSource, pilotSummary } from "./adsFacts.js";

const STORAGE_KEY = "ssb.ads.source";
const EMPTY = { status: "idle", facts: [], creatives: [], connections: [], error: null, loadedAt: null };
let cache = EMPTY;
let inflight = null;
const listeners = new Set();
const publish = (next) => { cache = next; listeners.forEach((fn) => fn(next)); };

function readSource() {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }   // ไม่เคยเลือก = null → ใช้ค่าเริ่มตามสิทธิ์
}

export async function loadPilotFacts({ force = false } = {}) {
  if (inflight) return inflight;
  if (!force && cache.status === "ready") return cache;
  publish({ ...cache, status: "loading", error: null });
  inflight = (async () => {
    try {
      const range = factsLoadRange(isoDay(new Date()));
      const [connections, facts, creatives] = await Promise.all([
        apiClient.ads.connections(), apiClient.ads.facts(range), apiClient.ads.creatives().catch(() => []),   // creative ไม่มี = ยังดูยอดได้
      ]);
      publish({ status: "ready", facts, creatives, connections: (connections ?? []).filter((c) => c.provider === "meta"), error: null, loadedAt: new Date().toISOString() });
    } catch (error) {
      publish({ ...EMPTY, status: "error", error });
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

export function useAdsData() {
  const { data } = useApp();
  const { user, demo } = useAuth();
  const [chosen, setChosen] = useState(readSource);
  const { source, canSwitch, canPreview } = adsSourceAccess({ demo, role: user?.role ?? null, stored: chosen });
  const [pilot, setPilot] = useState(cache);

  useEffect(() => { listeners.add(setPilot); return () => { listeners.delete(setPilot); }; }, []);
  useEffect(() => { if (source === "meta_pilot") loadPilotFacts(); }, [source]);

  const setSource = useCallback((next) => {
    const value = normalizeAdsSource(next);
    setChosen(value);
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* storage ถูกปิด — ใช้ค่าในหน่วยความจำ */ }
  }, []);

  const today = isoDay(new Date());
  const realCards = useMemo(() => factsToAdCards(pilot.facts, pilot.connections, { today, creatives: pilot.creatives ?? [] }), [pilot, today]);
  const cards = useMemo(() => source === "mock" ? data.cards : adsCardsForSource(data.cards, "meta_pilot", realCards), [source, data.cards, realCards]);
  const summary = useMemo(() => pilotSummary(pilot.connections, pilot.facts, { today }), [pilot, today]);

  return {
    source, setSource, canSwitch, canPreview, canPilot: canSwitch, cards,
    mockFallback: source === "mock",                   // ยอดใหม่ 62% เป็นค่าจำลอง — ห้ามใช้กับข้อมูลจริง
    pilot: { status: pilot.status, error: pilot.error, loadedAt: pilot.loadedAt, summary },
    reload: () => loadPilotFacts({ force: true }),
  };
}

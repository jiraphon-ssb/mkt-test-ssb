/* ============================================================
 Dashboard — หน้าเดียวจบ (รวมหน้าผลตอบรับเดิมเข้ามาเป็นแท็บ)
 กติกา: ข้อมูลชุดหนึ่งแสดง "ที่เดียว" ห้ามซ้ำข้ามไทล์
   ตัวเลข KPI ดิบ      → KpiRow (แถบบน) ที่เดียว
   สัดส่วนป้ายผล        → วงแหวน hero ที่เดียว
   รายการงานที่วัดผล   → ตารางอันดับโพสต์ (แท็บผลตอบรับ) ที่เดียว
   งานที่ต้องลงมือ      → เรื่องด่วน + ต้องเคลียร์ (คิวรอตรวจเต็มๆ อยู่หน้างาน)
 โครง: หัว (ทักทาย · ช่วงเวลา · CSV) → แถบบนที่เห็นทุกแท็บ → แท็บ ภาพรวม / ผลตอบรับ
 คำนวณผ่าน mktAnalytics + mktInsights (pure + มีเทส) ไม่คิดเลขในหน้าจอ
 ============================================================ */
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { CONTENT_STAGES } from "../mktEngine.js";
import { analyticsCards, kpiSummary, lastCompletedWeeks, measuredInRange, previousRange, rollupBy, weeklySeries, weeksRange, } from "../mktAnalytics.js";
import { computeInsights } from "../mktInsights.js";
import { HeroTile } from "./HeroTile.jsx";
import { KpiRow } from "./KpiRow.jsx";
import { InsightCta } from "./InsightCta.jsx";
import { FirstPassTile } from "./FirstPassTile.jsx";
import { StageWipTile } from "./StageWipTile.jsx";
import { RiskSection } from "./RiskSection.jsx";
import { ArchiveKnowTile } from "./ArchiveKnowTile.jsx";
import { Panel } from "../mktCard.jsx";
const TrendSection = lazy(() => import("./TrendSection.jsx").then((m) => ({ default: m.TrendSection })));
const PillarDonut = lazy(() => import("./PillarDonut.jsx").then((m) => ({ default: m.PillarDonut })));
const ResultsPanel = lazy(() => import("../results/ResultsPanel.jsx").then((m) => ({ default: m.ResultsPanel })));

/* ช่วงเวลา — ครอบคลุมตั้งแต่รอบเดือนถึงรายปี · label เป็นภาษาที่ทีมใช้พูดกันจริง
   ทุกค่านับเฉพาะ "สัปดาห์ที่จบแล้ว" เพื่อไม่ให้สัปดาห์ปัจจุบันที่ยังไม่ครบมากดค่าเฉลี่ย */
const RANGES = [
  { w: 4, label: "1 เดือน" },
  { w: 8, label: "2 เดือน" },
  { w: 12, label: "ไตรมาส" },
  { w: 26, label: "ครึ่งปี" },
  { w: 52, label: "1 ปี" },
];
const TABS = [
  { id: "overview", label: "ภาพรวม" },
  { id: "results", label: "ผลตอบรับ" },
];

export function Dashboard({ tab = "overview", onTabChange, onOpenCard, onJump }) {
  const { data, currentUser, inBrandScope } = useApp();
  const [rangeWeeks, setRangeWeeks] = useState(4);

  const v = useMemo(() => {
    const all = analyticsCards(data.cards);
    const scoped = all.filter(inBrandScope);
    const weeks = lastCompletedWeeks(rangeWeeks);
    const range = weeksRange(weeks);
    return {
      scoped, weeks,
      cur: kpiSummary(scoped, range),
      prevKpi: kpiSummary(scoped, previousRange(range)),
      measured: measuredInRange(scoped, range),
      series: weeklySeries(scoped, weeks),
      pillarRows: rollupBy(scoped, data.cards, "pillar", range),
      perStage: CONTENT_STAGES.map((s) => ({
        id: s.id, name: s.name,
        n: all.filter((c) => !c.archived && c.status === s.id).length,
      })),
    };
  }, [data, inBrandScope, rangeWeeks]);

  const insights = useMemo(() => computeInsights({ data, viewer: { id: currentUser.id, role: currentUser.role } }), [data, currentUser]);
  const actOn = useCallback((i) => {
    if (i.action?.screen)
      onJump(i.action.screen, i.action.brandId);
  }, [onJump]);

  return (<>
   {/* แถบช่วงเวลา — จุดเดียวที่คุมช่วงของทุกไทล์ในหน้า (ส่งออก CSV อยู่ที่ตั้งค่า → ข้อมูล) */}
   <div className="dash-bar">
    <div className="dash-range">
     {RANGES.map((r) => (<button key={r.w} className={rangeWeeks === r.w ? "on" : ""} onClick={() => setRangeWeeks(r.w)}>
       {r.label}
      </button>))}
    </div>
   </div>

   {/* ---- แถบบน: ตัวเลขดิบ (ที่เดียว) + ป้ายผล + เรื่องด่วน — เห็นทุกแท็บ ---- */}
   <div className="tile-body rs-kpi">
    <KpiRow cur={v.cur} prev={v.prevKpi} rangeLabel={RANGES.find((r) => r.w === rangeWeeks)?.label}/>
   </div>
   <div className="dash-top">
    <HeroTile measured={v.measured} allCards={data.cards} onSeeResults={() => onTabChange("results")}/>
    <div className="dash-topright">
     <InsightCta items={insights} onAct={actOn}/>
    </div>
   </div>

   {/* ---- แท็บเนื้อหา ---- */}
   <div className="dash-tabs">
    {TABS.map((t) => (<button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => onTabChange(t.id)}>
      {t.label}
     </button>))}
   </div>

   {tab === "overview" && (<>
    <div className="dash-2up">
     <Panel title="แนวโน้ม" info={{ label: "แนวโน้ม", text: "แท่ง = จำนวนงานที่วัดผลแล้ว · เส้น = ER (engagement ÷ reach) · นับตามวันโพสต์ ไม่รวมสัปดาห์ที่ยังไม่จบ" }}>
      <Suspense fallback={<div className="empty-row">กำลังโหลดกราฟ…</div>}>
       <TrendSection series={v.series}/>
      </Suspense>
     </Panel>

     <Panel title="สัดส่วนงานตาม Pillar" info={{ label: "Pillar", text: "นับจากงานที่วัดผลแล้วในช่วง · SOP ให้กระจายครบ 4 pillar ตาม Monthly Plan ไม่กระจุกตัวเดียว" }}>
      <Suspense fallback={<div className="empty-row">กำลังโหลดกราฟ…</div>}>
       <PillarDonut rows={v.pillarRows}/>
      </Suspense>
     </Panel>
    </div>

    <div className="dash-3up">
     <Panel title="ผ่านรอบแรก" info={{ label: "ผ่านรอบแรก", text: "สัดส่วนงานที่ Team Lead อนุมัติรอบแรกโดยไม่ตีกลับ · จุดเขียว = สัปดาห์ที่ถึงเป้า ครบ 4 จุดติดกันได้ปลดตรวจรายชิ้น" }}>
      <FirstPassTile data={data} viewer={currentUser}/>
     </Panel>

     <Panel title="งานค้างในสาย" info={{ label: "งานค้างในสาย", text: "จำนวนการ์ดที่ยังไม่จบ แยกตามขั้นที่ค้างอยู่ตอนนี้" }}>
      <StageWipTile perStage={v.perStage}/>
     </Panel>

     <Panel title="ต้องเคลียร์" info={{ label: "ต้องเคลียร์", text: "สถานะสดตอนนี้ ไม่ขึ้นกับช่วงเวลาด้านบน · กดที่รายการเพื่อเปิดการ์ด" }}>
      <RiskSection data={data} onOpenCard={onOpenCard} onJump={onJump}/>
     </Panel>
    </div>

    {/* ความรู้จากคลัง — สูตรที่เวิร์ค + บทเรียน โผล่หน้าแรกให้ทีมเห็นโดยไม่ต้องไปขุด */}
    <Panel title="จากคลังผลงาน" icon="clipboard"
     info={{ label: "จากคลังผลงาน", text: "สกัดจากงานที่ปิดแล้ว: สูตรที่เวิร์ค (กลุ่มที่ ER ชนะค่าเฉลี่ยแบรนด์ ≥3 งาน) กดไปหน้าคลัง · บทเรียนที่ทีมจดตอนปิดงาน กดเปิดการ์ดต้นเรื่อง" }}
     tools={<button className="risk-jump" onClick={() => onJump("archive")}>ไปหน้าคลัง</button>}>
     <ArchiveKnowTile data={data} onOpenCard={onOpenCard} onJump={onJump}/>
    </Panel>
   </>)}

   {tab === "results" && (
    <Suspense fallback={<div className="empty">กำลังโหลดผลตอบรับ…</div>}>
     <ResultsPanel rangeWeeks={rangeWeeks} measured={v.measured} onOpenCard={onOpenCard}/>
    </Suspense>
   )}

  </>);
}

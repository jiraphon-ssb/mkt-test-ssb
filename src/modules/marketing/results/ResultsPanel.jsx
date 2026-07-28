/* ============================================================
 แผง "ผลตอบรับ" — เนื้อหาผลงานที่โพสต์ไปแล้ว
 เดิมเป็นหน้าแยก ตอนนี้เป็นแท็บหนึ่งในหน้า Dashboard
 หัวข้อ/ช่วงเวลา/CSV/ตัวเลข KPI อยู่ที่แถบบนของ Dashboard — ที่นี่ไม่แสดงซ้ำ
 ลำดับ: ช่องทาง + วาระประชุม → อันดับโพสต์ → เจาะรายมิติ → เวลาโพสต์ + ยิงแอด
 คำนวณผ่าน mktAnalytics ทั้งหมด (pure + มีเทส) ไม่คิดเลขในหน้าจอ
 ============================================================ */
import { useMemo } from "react";
import { useApp } from "../useMkt.jsx";
import { adsRollup, analyticsCards, kpiSummary, lastCompletedWeeks, previousRange, publishHeatmap, rollupBy, weeksRange, weeklySeriesBy, } from "../mktAnalytics.js";
import { BreakdownSection } from "../dash/BreakdownSection.jsx";
import { TimingHeatmap } from "../dash/TimingHeatmap.jsx";
import { AdsSection } from "../dash/AdsSection.jsx";
import { WeeklyTopBottomTile } from "../dash/WeeklyTopBottomTile.jsx";
import { PlatformBars } from "./PlatformBars.jsx";
import { TopPosts } from "./TopPosts.jsx";
import { Panel } from "../mktCard.jsx";

export function ResultsPanel({ rangeWeeks, measured, onOpenCard }) {
  const { data, currentUser, inBrandScope } = useApp();
  const v = useMemo(() => {
    const all = analyticsCards(data.cards);
    const scoped = all.filter(inBrandScope);
    const weeks = lastCompletedWeeks(rangeWeeks);
    const range = weeksRange(weeks);
    const prev = previousRange(range);
    return {
      scoped, weeks, range, prev,
      cur: kpiSummary(scoped, range),   /* ใช้แค่ teamER ของกราฟ — ตัวเลขโชว์อยู่แถบบน */
      brandRows: rollupBy(scoped, data.cards, "brand", range),
      pillarRows: rollupBy(scoped, data.cards, "pillar", range),
      channelRows: rollupBy(scoped, data.cards, "channel", range, data.channels),
      ownerRows: rollupBy(scoped, data.cards, "owner", range),
      kindRows: rollupBy(scoped, data.cards, "kind", range),
      brandSeries: weeklySeriesBy(scoped, weeks, (c) => c.brand_id),
      heat: publishHeatmap(scoped, range),
      ads: adsRollup(scoped, range),
    };
  }, [data, inBrandScope, rangeWeeks]);

  return (<>
   <div className="rs-grid">
    <Panel title="ช่องทางไหนได้ผล" info={{ label: "ช่องทาง", text: "แถบบนคือสัดส่วน engagement ของแต่ละช่องทางในช่วงที่เลือก · ลูกศรเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน" }}>
      <PlatformBars cards={v.scoped} allCards={data.cards} range={v.range} prev={v.prev}/>
    </Panel>

    <Panel title="วาระ Weekly Sync" info={{ label: "Weekly Sync", text: "SOP: ประชุมสัปดาห์คุยแค่ Top 1 / Bottom 1 ว่าทำไมได้และทำไมไม่ได้ ไม่ไล่ทุกโพสต์" }}>
      <WeeklyTopBottomTile data={data} onOpenCard={onOpenCard}/>
    </Panel>
   </div>

   <Panel title="อันดับโพสต์" info={{ label: "อันดับโพสต์", text: "ทุกงานที่วัดผลแล้วในช่วงที่เลือก · ป้ายผลเทียบกับค่าเฉลี่ย ER ของแบรนด์ตัวเอง ไม่ใช่ข้ามแบรนด์ · กดแถวเพื่อเปิดการ์ด" }}>
    <TopPosts cards={measured} data={data} onOpen={onOpenCard}/>
   </Panel>

   <Panel title="เจาะรายมิติ" info={{ label: "เจาะรายมิติ", text: "เทียบ ER ของแต่ละกลุ่มกับค่าเฉลี่ยทีม (เส้นประ) · ป้ายผลเทียบกับค่าเฉลี่ยของแบรนด์เอง" }}>
    <BreakdownSection data={data} brandRows={v.brandRows} pillarRows={v.pillarRows} channelRows={v.channelRows} ownerRows={v.ownerRows} kindRows={v.kindRows} weeks={v.weeks} brandSeries={v.brandSeries} teamER={v.cur.er} showOwnerTab={currentUser.role !== "content_owner"}/>
   </Panel>

   <div className="rs-grid">
    <Panel title="เวลาโพสต์" info={{ label: "เวลาโพสต์", text: "ตัวเลขในช่อง = จำนวนงาน · สีเข้ม = ER เฉลี่ยสูง · กรอบส้ม = ช่วงทอง (งาน ≥3 ชิ้น และ ER สูงกว่าค่าเฉลี่ย 30%+)" }}>
      <TimingHeatmap cells={v.heat} teamER={v.cur.er}/>
    </Panel>

    <Panel title="ยิงแอด" info={{ label: "ยิงแอด", text: "เฉพาะงาน Project ที่กรอกงบแล้ว · CPL = งบ ÷ lead ที่ attribute ได้" }}>
      <AdsSection data={data} rows={v.ads.rows} spend={v.ads.spend} leads={v.ads.leads} cpl={v.ads.cpl} weeks={v.weeks} allCards={v.scoped}/>
    </Panel>
   </div>
  </>);
}

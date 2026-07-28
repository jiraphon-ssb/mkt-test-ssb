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
import { analyticsCards, kpiSummary, lastCompletedWeeks, measuredInRange, previousRange, rollupBy, weeklySeries, weeksRange, stageFlows, ideaToPublishedCycle, publishHeatmap } from "../mktAnalytics.js";
import { computeInsights } from "../mktInsights.js";
import { HeroTile } from "./HeroTile.jsx";
import { KpiRow } from "./KpiRow.jsx";
import { InsightCta } from "./InsightCta.jsx";
import { FirstPassTile } from "./FirstPassTile.jsx";
import { StageWipTile } from "./StageWipTile.jsx";
import { RiskSection } from "./RiskSection.jsx";
import { ArchiveKnowTile } from "./ArchiveKnowTile.jsx";
import { DnaHealthTile } from "./DnaHealthTile.jsx";
import { Panel } from "../mktCard.jsx";
import { Icon } from "../mktIcon.jsx";
const TrendSection = lazy(() => import("./TrendSection.jsx").then((m) => ({ default: m.TrendSection })));
const PillarDonut = lazy(() => import("./PillarDonut.jsx").then((m) => ({ default: m.PillarDonut })));
const FunnelSection = lazy(() => import("./FunnelSection.jsx").then((m) => ({ default: m.FunnelSection })));
const TimingHeatmap = lazy(() => import("./TimingHeatmap.jsx").then((m) => ({ default: m.TimingHeatmap })));
const ResultsPanel = lazy(() => import("../results/ResultsPanel.jsx").then((m) => ({ default: m.ResultsPanel })));

/* ช่วงเวลา — ครอบคลุมตั้งแต่รอบเดือนถึงรายปี · label เป็นภาษาที่ทีมใช้พูดกันจริง
   ทุกค่านับเฉพาะ "สัปดาห์ที่จบแล้ว" เพื่อไม่ให้สัปดาห์ปัจจุบันที่ยังไม่ครบมากดค่าเฉลี่ย */
import { AnalyticsTab } from "./AnalyticsTab.jsx";
import { PipelineTab } from "./PipelineTab.jsx";

const RANGES = [
  { w: 4, label: "1 เดือน" },
  { w: 8, label: "2 เดือน" },
  { w: 12, label: "ไตรมาส" },
  { w: 26, label: "ครึ่งปี" },
  { w: 52, label: "1 ปี" },
];

/* แท็บของ Dashboard — ภาพรวมเห็นทั้งหมด · อีก 3 แท็บเจาะลึกทีละมุม */
const DASH_TABS = [
  { id: "overview", label: "ภาพรวม", icon: "grid" },
  { id: "pipeline", label: "สายผลิต", icon: "columns" },
  { id: "analytics", label: "วิเคราะห์", icon: "chart" },
  { id: "results", label: "ผลตอบรับ", icon: "trophy" },
];

export function Dashboard({ tab = "overview", onTabChange, onOpenCard, onJump }) {
  const { data, currentUser, inBrandScope, brandFilter } = useApp();
  const [rangeWeeks, setRangeWeeks] = useState(4);
  /* ควบคุมแท็บเองได้ถ้า shell ไม่ได้ส่ง onTabChange มา (เผื่อ standalone) */
  const [localTab, setLocalTab] = useState(tab);
  const activeTab = onTabChange ? tab : localTab;
  const setTab = onTabChange ?? setLocalTab;

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
      brandRows: rollupBy(scoped, data.cards, "brand", range),
      channelRows: rollupBy(scoped, data.cards, "channel", range, data.channels),
      ownerRows: rollupBy(scoped, data.cards, "owner", range),
      kindRows: rollupBy(scoped, data.cards, "kind", range),
      flows: stageFlows(scoped, data.status_history ?? [], range),
      cycle: ideaToPublishedCycle(scoped, data.status_history ?? [], range),
      heatmap: publishHeatmap(scoped, range),
      perStage: CONTENT_STAGES.map((s) => ({
        id: s.id, name: s.name,
        n: all.filter((c) => !c.archived && c.status === s.id).length,
      })),
      range,
    };
  }, [data, inBrandScope, rangeWeeks]);

  const insights = useMemo(() => computeInsights({ data, viewer: { id: currentUser.id, role: currentUser.role } }), [data, currentUser]);
  const actOn = useCallback((i) => {
    if (i.action?.screen)
      onJump(i.action.screen, i.action.brandId);
  }, [onJump]);

  /* ป้าย scope — ตรงกับตัวสลับบริบทของ shell จริง (ทั้งกลุ่ม/แบรนด์เดียว/หลายแบรนด์) */
  const currentBrandName = brandFilter === "all" ? "ทุกแบรนด์"
    : brandFilter === "multi" ? `${v.scoped.length ? new Set(v.scoped.map((c) => c.brand_id)).size : 0} แบรนด์`
    : data.brands.find((b) => b.id === brandFilter)?.name ?? "ทุกแบรนด์";

  return (
    <div className="dash-linear-shell">
      {/* ── Top Bar / Header Command ── */}
      <header className="dash-linear-header">
        <div className="dash-header-title">
          <div className="dash-status-dot" title="ระบบกำลังทำงานปกติ" />
          <h1 className="dash-title-text">Marketing Overview</h1>
          <span className="dash-scope-pill">{currentBrandName}</span>
          <span className="dash-count-tag mono">{v.scoped.length} cards</span>
        </div>
        <div className="dash-range-switch">
          {RANGES.map((r) => (
            <button
              key={r.w}
              className={`dash-range-btn ${rangeWeeks === r.w ? "active" : ""}`}
              onClick={() => setRangeWeeks(r.w)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── แท็บ: ภาพรวมเห็นทั้งหมด · อีก 3 แท็บเจาะลึกทีละมุม ── */}
      <nav className="dash-tabs" role="tablist">
        {DASH_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`dash-tab ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </nav>

      {/* ── KPI Bar — เห็นทุกแท็บ (ตัวเลขหลักของช่วงเวลาที่เลือก) ── */}
      <section className="dash-card dash-kpi-bar-card">
        <KpiRow cur={v.cur} prev={v.prevKpi} rangeLabel={RANGES.find((r) => r.w === rangeWeeks)?.label} />
      </section>

      {activeTab === "pipeline" && (
        <PipelineTab data={data} scopedCards={v.scoped} onOpenCard={onOpenCard} />
      )}

      {activeTab === "analytics" && (
        <AnalyticsTab
          data={data} scopedCards={v.scoped}
          brandRows={v.brandRows} channelRows={v.channelRows}
          ownerRows={v.ownerRows} kindRows={v.kindRows}
        />
      )}

      {activeTab === "results" && (
        <section className="dash-card">
          <Suspense fallback={<div className="empty">กำลังโหลดผลตอบรับ…</div>}>
            <ResultsPanel rangeWeeks={rangeWeeks} measured={v.measured} onOpenCard={onOpenCard} />
          </Suspense>
        </section>
      )}

      {activeTab === "overview" && (<>

      {/* ── Section 2: Asymmetric Core Analytics & Actions (65% / 35%) ── */}
      <section className="dash-asym-grid">
        <div className="dash-col-main">
          {/* Trend Chart Card */}
          <div className="dash-card">
            <Panel title="แนวโน้ม Engagement & Content Volume" info={{ label: "แนวโน้ม", text: "แสดงจำนวนงานที่วัดผลแล้ว (แท่ง) และ Engagement Rate (เส้น) ย้อนหลังตามช่วงเวลา" }}>
              <Suspense fallback={<div className="empty-row">กำลังโหลดกราฟ…</div>}>
                <TrendSection series={v.series} />
              </Suspense>
            </Panel>
          </div>

          {/* Dual Grid: Pillars & Process Funnel */}
          <div className="dash-grid-2col">
            <div className="dash-card">
              <Panel title="สัดส่วน Content Pillar" info={{ label: "Pillar", text: "สัดส่วนคอนเทนต์แบ่งตาม Pillar ประจำแบรนด์" }}>
                <Suspense fallback={<div className="empty-row">กำลังโหลดกราฟ…</div>}>
                  <PillarDonut rows={v.pillarRows} />
                </Suspense>
              </Panel>
            </div>

            <div className="dash-card">
              <Panel title="ระยะเวลาในสายผลิต (Cycle Time)" info={{ label: "Funnel", text: "ระยะเวลาเฉลี่ยตั้งแต่ไอเดียจนถึงตีพิมพ์และวัดผล" }}>
                <Suspense fallback={<div className="empty-row">กำลังโหลด Funnel…</div>}>
                  <FunnelSection flows={v.flows} cycle={v.cycle} />
                </Suspense>
              </Panel>
            </div>
          </div>
        </div>

        {/* Sidebar Column: Strategic Actions & Performance Circle */}
        <div className="dash-col-side">
          <div className="dash-card">
            <InsightCta items={insights} onAct={actOn} />
          </div>

          <div className="dash-card">
            <HeroTile measured={v.measured} allCards={data.cards} onSeeResults={() => {}} />
          </div>
        </div>
      </section>

      {/* ── Section 3: Operations & Quality Triplet ── */}
      <section className="dash-grid-3col">
        <div className="dash-card">
          <Panel title="อัตราผ่านตรวจรอบแรก (First Pass)" info={{ label: "First Pass", text: "สัดส่วนงานที่ไม่ถูกตีกลับในรอบการตรวจครั้งแรก" }}>
            <FirstPassTile data={data} viewer={currentUser} />
          </Panel>
        </div>

        <div className="dash-card">
          <Panel title="ดัชนี Content DNA Quality" info={{ label: "DNA", text: "ความครบถ้วนของข้อมูลในสายการผลิต" }}>
            <DnaHealthTile cards={data.cards} brandId={data.brands[0]?.id} />
          </Panel>
        </div>

        <div className="dash-card">
          <Panel title="งานค้างในสายผลิต (WIP)" info={{ label: "WIP", text: "จำนวนงานคงค้างแยกรายสถานะปัจจุบัน" }}>
            <StageWipTile perStage={v.perStage} />
          </Panel>
        </div>
      </section>

      {/* ── Section 4: Operational Risks & Knowledge Base (50% / 50%) ── */}
      <section className="dash-grid-2col">
        <div className="dash-card">
          <Panel title="เรื่องที่ต้องเร่งจัดการ (Action Queue)" info={{ label: "ต้องเคลียร์", text: "การ์ดที่ค้าง เกิน SLA หรือถูกตีกลับ" }}>
            <RiskSection data={data} onOpenCard={onOpenCard} onJump={onJump} />
          </Panel>
        </div>

        <div className="dash-card">
          <Panel title="ช่วงเวลาโพสต์ที่ดีที่สุด (Timing Heatmap)" info={{ label: "Heatmap", text: "ช่วงวัน-เวลาที่มีอัตรา Engagement สูงสุด" }}>
            <Suspense fallback={<div className="empty-row">กำลังโหลด Heatmap…</div>}>
              <TimingHeatmap cells={v.heatmap} teamER={v.cur.er} />
            </Suspense>
          </Panel>
        </div>
      </section>

      {/* ── Section 5: Formula Recipes ── */}
      <section className="dash-card">
        <Panel title="สูตรสำเร็จจากคลังผลงาน (Content Recipes)" icon="clipboard" info={{ label: "สูตรสำเร็จ", text: "คลังไอเดียที่ทำ Engagement ชนะค่าเฉลี่ยแบรนด์" }} tools={<button className="risk-jump" onClick={() => onJump("archive")}>ไปหน้าคลัง</button>}>
          <ArchiveKnowTile data={data} onOpenCard={onOpenCard} onJump={onJump} />
        </Panel>
      </section>
      </>)}
    </div>
  );
}


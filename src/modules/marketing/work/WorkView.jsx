/* ============================================================
 Work — หน้าเดียวจบของ "งาน" 5 มุมมอง
  บอร์ด (kanban เดินการ์ด) · ลิสต์ (ค้นหา/เรียง) · รอตรวจ (คิว SLA) · ปฏิทิน · ตั้งค่า
 ตั้งค่ารวมมาที่นี่เพราะเป็นของชุดเดียวกัน (ทีม/แบรนด์/กติกาที่การ์ดทุกใบใช้)
 แถบเครื่องมือ = แถวเดียว: ตัวกรองซ้าย → จำนวน → แท็บขวา (ไม่มีหัวข้อซ้ำ breadcrumb)
 ตัวกรองอยู่ "จุดเดียว" ที่นี่ และมีผลกับทุกมุมมอง — บอร์ด/ลิสต์กรองการ์ดตรงๆ
 ส่วนคิวรอตรวจกับปฏิทินรับ predicate ตัวเดียวกันไปกรองชุดข้อมูลของตัวเอง
 ตัวกรองอยู่ระดับนี้ → สลับบอร์ด↔ลิสต์แล้วตัวกรองไม่หาย
 (ปฏิทิน/รอตรวจไม่ใช้ตัวกรองชุดนี้ — ความหมายคนละแบบ)
 ============================================================ */
import { useCallback, useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { hoursWaitingInReview, isAlbum } from "../mktRules.js";
import { STAGE_META } from "../mktEngine.js";
import { Board } from "./BoardView.jsx";
import { ListView } from "./ListView.jsx";
import { ReviewQueue } from "./ReviewQueue.jsx";
import { Calendar } from "./CalendarView.jsx";
import { ArchiveView } from "./ArchiveView.jsx";
import { Icon } from "../mktIcon.jsx";
import { MktSelect } from "../mktSelect.jsx";
import { Admin } from "../admin/AdminView.jsx";
const VIEWS = [
  { id: "board", label: "บอร์ด" },
  { id: "list", label: "ลิสต์" },
  { id: "review", label: "รอตรวจ" },
  { id: "cal", label: "ปฏิทิน" },
  { id: "archive", label: "คลัง" },
  { id: "admin", label: "ตั้งค่า", leadOnly: true },
];
/** ชนิดชิ้นงานของการ์ด — จุดเดียวที่แปล brief → single/album/video ทุกจอเรียกตัวนี้ */
const kindOf = (b) => (b.format === "video" ? "video" : isAlbum(b) ? "album" : "single");
const KIND_LABEL = { single: "ภาพเดี่ยว (AW)", album: "ชุดภาพ (Album)", video: "คลิป (Video)" };

export function Work({ view, onViewChange, onOpen }) {
  const { data, currentUser, inBrandScope, settings } = useApp();
  /* ตัวกรองร่วมของบอร์ด+ลิสต์ */
  const [brandFilter, setBrandFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState(null);   /* กดจากแถบสายผลิตในมุมมองลิสต์ */
  const [trackFilter, setTrackFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  /** ชนิดชิ้นงาน — ภาพเดี่ยว / ชุดภาพ / คลิป (คิดจาก brief ไม่ได้เก็บเป็นคอลัมน์) */
  const [kindFilter, setKindFilter] = useState("all");
  const [realtimeOnly, setRealtimeOnly] = useState(false);
  /** โหมดของฉัน — เหลือเฉพาะใบที่ฉันเกี่ยว: เป็นเจ้าของ หรือรอฉันตรวจ (team lead) */
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  /** ลิสต์เท่านั้น — ที่เดียวในแอพที่ย้อนดูงานที่ปิดแล้ว */
  const [withArchived, setWithArchived] = useState(false);
  /** จอเล็กยุบแถวตัวกรองไว้ (กินพื้นที่ 2 บรรทัดจาก 3) — จอใหญ่ CSS บังคับโชว์ตลอด */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const useFilters = view !== "admin";       /* ตั้งค่าไม่มีอะไรให้กรอง */
  const q = search.trim().toLowerCase();
  /** เกณฑ์กรองชุดเดียวของทั้งหน้า — ส่งต่อให้ทุกมุมมองใช้เกณฑ์เดียวกัน */
  const match = useCallback((c) => !c.id.startsWith("hist") &&
    inBrandScope(c) &&
    (brandFilter === "all" || c.brand_id === brandFilter) &&
    (stageFilter == null || c.status === stageFilter) &&
    (trackFilter === "all" || c.track === trackFilter) &&
    (ownerFilter === "all" || c.owner_id === ownerFilter) &&
    (kindFilter === "all" || kindOf(c.brief) === kindFilter) &&
    (!realtimeOnly || c.is_realtime) &&
    (!mineOnly || c.owner_id === currentUser.id ||
      (c.status === "review" && currentUser.role === "team_lead")) &&
    (q === "" || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)),
    [inBrandScope, brandFilter, stageFilter, trackFilter, ownerFilter, kindFilter, realtimeOnly, mineOnly, currentUser, q]);
  const filtered = useMemo(() => data.cards.filter((c) =>
    (view === "list" && withArchived ? true : !c.archived) && match(c)), [data.cards, match, withArchived, view]);
  const owners = data.profiles.filter((p) => p.active && !p.id.startsWith("hist"));
  /** แบรนด์ที่เลือกกรองได้ = แบรนด์ที่ยัง active และอยู่ในขอบเขตของ shell */
  const brandOptions = data.brands.filter((b) => b.active && inBrandScope({ brand_id: b.id }));
  const filtersOn = stageFilter != null || brandFilter !== "all" || trackFilter !== "all" || ownerFilter !== "all" || kindFilter !== "all" || realtimeOnly || mineOnly || q !== "";
  const clearFilters = () => {
    setBrandFilter("all");
    setStageFilter(null);
    setTrackFilter("all");
    setOwnerFilter("all");
    setKindFilter("all");
    setRealtimeOnly(false);
    setMineOnly(false);
    setSearch("");
  };
  const reviewCount = data.cards.filter((c) => c.status === "review").length;
  const reviewOverdue = data.cards.some((c) => c.status === "review" && hoursWaitingInReview(c) > settings.sla_hours);
  /* จำนวนตัวกรองที่เปิดอยู่ — โชว์บนปุ่ม "ตัวกรอง" ของจอเล็กที่ยุบแถวไว้ */
  const filterCount = (stageFilter != null ? 1 : 0) + (brandFilter !== "all" ? 1 : 0) + (trackFilter !== "all" ? 1 : 0) + (ownerFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0) +
    (realtimeOnly ? 1 : 0) + (q !== "" ? 1 : 0);
  const emptyByFilter = (view === "board" || view === "list") && filtered.length === 0 && filtersOn;
  /** ชิปสรุปตัวกรองที่เปิดอยู่ — เห็นว่ากรองอะไรโดยไม่ต้องกางแผง */
  const activeChips = [
    q !== "" && { key: "q", label: `ค้นหา "${search.trim()}"`, clear: () => setSearch("") },
    stageFilter != null && { key: "stage", label: `ขั้น ${STAGE_META[stageFilter].name}`, clear: () => setStageFilter(null) },
    brandFilter !== "all" && { key: "brand", label: data.brands.find((b) => b.id === brandFilter)?.name ?? "แบรนด์", clear: () => setBrandFilter("all") },
    trackFilter !== "all" && { key: "track", label: trackFilter === "content" ? "Content" : "Project / Ads", clear: () => setTrackFilter("all") },
    ownerFilter !== "all" && { key: "owner", label: data.profiles.find((p) => p.id === ownerFilter)?.display_name ?? "ผู้ดูแล", clear: () => setOwnerFilter("all") },
    kindFilter !== "all" && { key: "kind", label: KIND_LABEL[kindFilter], clear: () => setKindFilter("all") },
    realtimeOnly && { key: "rt", label: "Realtime", clear: () => setRealtimeOnly(false) },
  ].filter(Boolean);

  const views = VIEWS.filter((v) => !v.leadOnly || currentUser.role === "team_lead");

  return (<>
   {/* แถบเครื่องมือแถวเดียว ติดบนตอนเลื่อน — ตัวกรองซ้าย · จำนวน · แท็บขวา */}
   <div className="work-bar">
    {useFilters ? (<>
      <input className="bf-search" placeholder="ค้นหาชื่องาน / รหัส" value={search} onChange={(e) => setSearch(e.target.value)}/>

      {/* โหมดของฉัน — ปุ่มเดียวเช้ามาเห็นหมากตัวเองทันที (เจ้าของ + รอฉันตรวจ) */}
      <button className={`bf-mine ${mineOnly ? "on" : ""}`} onClick={() => setMineOnly(!mineOnly)}
       title="เหลือเฉพาะงานที่ฉันเป็นเจ้าของ หรือรอฉันตรวจ">
       <Icon name="user" size={13}/> ของฉัน
      </button>

      {/* ตัวกรองยุบไว้ในปุ่มเดียว — แถบเครื่องมือไม่แน่น แต่ยังเห็นว่ากรองอะไรอยู่จากชิปข้างๆ */}
      <div className="bf-wrap">
       <button className={`bf-more ${filterCount ? "on" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
        <Icon name="sliders" size={14}/> ตัวกรอง{filterCount > 0 && <span className="ws-badge">{filterCount}</span>}
       </button>
       <div className={`board-filters ${filtersOpen ? "open" : ""}`}>
        <div className="bf-title">กรองงาน</div>
       {/* กรองแบรนด์ภายในขอบเขตที่ shell เลือกไว้ — ไม่ใช่ตัวสลับ context (นั่นเป็นของ shell)
           ถ้าขอบเขตเหลือแบรนด์เดียวอยู่แล้วก็ไม่ต้องมีให้เลือก */}
        {brandOptions.length > 1 && (<label className="bf-field">
          <span>แบรนด์</span>
          <MktSelect compact value={brandFilter} onChange={setBrandFilter} options={[
            { value: "all", label: "ทุกแบรนด์" },
            ...brandOptions.map((b) => ({ value: b.id, label: b.name, dot: b.color })),
          ]}/>
         </label>)}
        <label className="bf-field">
         <span>ประเภท</span>
         <MktSelect compact value={trackFilter} onChange={setTrackFilter} options={[
           { value: "all", label: "ทุกประเภท" },
           { value: "content", label: "Content", hint: "7 ขั้น" },
           { value: "project", label: "Project / Ads", hint: "5 ขั้น" },
         ]}/>
        </label>
        <label className="bf-field">
         <span>ชนิดชิ้นงาน</span>
         <MktSelect compact value={kindFilter} onChange={setKindFilter} options={[
           { value: "all", label: "ทุกชนิด" },
           { value: "single", label: "ภาพเดี่ยว (AW)", icon: "image" },
           { value: "album", label: "ชุดภาพ (Album)", icon: "layers" },
           { value: "video", label: "คลิป (Video)", icon: "video" },
         ]}/>
        </label>
        <label className="bf-field">
         <span>ผู้ดูแล</span>
         <MktSelect compact value={ownerFilter} onChange={setOwnerFilter} options={[
           { value: "all", label: "ทุกผู้ดูแล" },
           ...owners.map((p) => ({ value: p.id, label: p.display_name })),
         ]}/>
        </label>
        <div className="bf-row">
         <button className={`bf-toggle ${realtimeOnly ? "on" : ""}`} onClick={() => setRealtimeOnly(!realtimeOnly)}>
          Realtime
         </button>
         {view === "list" && (<button className={`bf-toggle ${withArchived ? "on" : ""}`} onClick={() => setWithArchived(!withArchived)}>
           รวมงานที่ปิดแล้ว
          </button>)}
        </div>
        <div className="bf-foot">
         <button className="bf-clear" onClick={clearFilters} disabled={!filtersOn}>ล้างทั้งหมด</button>
         <button className="btn dark small" onClick={() => setFiltersOpen(false)}>เสร็จ</button>
        </div>
       </div>
      </div>

      {/* ชิปบอกตัวกรองที่เปิดอยู่ — กด × เพื่อปิดทีละอัน */}
      {activeChips.map((ch) => (<button className="bf-chip" key={ch.key} onClick={ch.clear} title="เอาตัวกรองนี้ออก">
        {ch.label} <i>✕</i>
       </button>))}

     </>) : <span className="bf-spacer"/>}

    <div className="work-switch">
     {views.map((v) => (<button key={v.id} className={view === v.id ? "on" : ""} onClick={() => onViewChange(v.id)}>
       {v.label}
       {v.id === "review" && reviewCount > 0 && (<span className={`ws-badge ${reviewOverdue ? "alert" : ""}`}>{reviewCount}</span>)}
      </button>))}
    </div>
   </div>

   {emptyByFilter ? (<div className="empty">
     <div className="t">ไม่มีงานตรงกับตัวกรอง</div>
     <button className="btn ghost small" style={{ marginTop: 10 }} onClick={clearFilters}>ล้างตัวกรอง</button>
    </div>) : (<>
     {view === "board" && <Board cards={filtered} onOpen={onOpen}/>}
     {view === "list" && <ListView
       cards={filtered} allCards={data.cards.filter((c) => !c.id.startsWith("hist") && !c.archived && inBrandScope(c))}
       onOpen={onOpen}
       stageFilter={stageFilter} onStageFilter={setStageFilter}
       onQuickFilter={(kind, id) => {
        if (kind === "brand") setBrandFilter(brandFilter === id ? "all" : id);
        if (kind === "owner") setOwnerFilter(ownerFilter === id ? "all" : id);
        if (kind === "kind") setKindFilter(kindFilter === id ? "all" : id);
       }}/>}
    </>)}
   {view === "review" && <ReviewQueue match={match} onOpen={onOpen}/>}
   {view === "cal" && <Calendar onOpen={onOpen} match={match}/>}
   {view === "archive" && <ArchiveView match={match} onOpen={onOpen}/>}
   {view === "admin" && <Admin />}
  </>);
}

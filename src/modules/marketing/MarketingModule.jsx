/* ============================================================
   MarketingModule — โมดูล content pipeline (digital twin ของ SOP v1.1)
   default export ตามธรรมเนียมโมดูลของแพลตฟอร์ม · ครอบด้วย .mkt-root
   shell เป็นคนเลือกหน้า (route) แล้วส่ง view เข้ามา — โมดูลไม่มี nav ของตัวเอง
   ============================================================ */

import { Suspense, lazy, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "./useMkt.jsx";
import { Work } from "./work/WorkView.jsx";
import { Admin } from "./admin/AdminView.jsx";
import { CardSheet } from "./detail/CardDrawer.jsx";
import { IdeaModal } from "./detail/IdeaDialog.jsx";
import { MktStyles, Toaster } from "./mktUi.jsx";
import "./mktStyles.css";

// Dashboard ลาก Chart.js มาด้วย — โหลดเฉพาะตอนเปิดหน้านั้น
const Dashboard = lazy(() => import("./dash/DashboardView.jsx").then((m) => ({ default: m.Dashboard })));

export default function MarketingModule({ view = "work" }) {
  const { data, toastState } = useApp();
  const navigate = useNavigate();

  const [workView, setWorkView] = useState("board");
  const [dashTab, setDashTab] = useState("overview");
  const [openCard, setOpenCard] = useState(null);
  const [ideaOpen, setIdeaOpen] = useState(false);

  // การ์ดที่เปิดอยู่ต้อง sync กับ data ล่าสุด (หลัง mutate)
  const liveCard = openCard ? data.cards.find((c) => c.id === openCard.id) ?? null : null;

  /** ปุ่มใน insight ที่พาไปที่อื่น — "results" เป็นแท็บใน Dashboard ที่เหลือเป็นมุมมองในหน้างาน */
  const jump = (to) => {
    if (to === "results") { setDashTab("results"); navigate("/mkt/dashboard"); return; }
    setWorkView(to);
    navigate("/mkt/work");
  };

  return (
    <div className="mkt-root">
      <MktStyles />

      {view === "work" && (
        <Work
          view={workView}
          onViewChange={setWorkView}
          onOpen={setOpenCard}
          onNewIdea={() => setIdeaOpen(true)}
        />
      )}

      {view === "dash" && (
        <Suspense fallback={<div className="empty">กำลังโหลด Dashboard…</div>}>
          <Dashboard tab={dashTab} onTabChange={setDashTab} onOpenCard={setOpenCard} onJump={jump} />
        </Suspense>
      )}

      {view === "admin" && <Admin />}

      {/* ปุ่มลอย "งานใหม่" — action ของโมดูล จึงอยู่ในโมดูล ไม่ใช่ shell */}
      <button className="fab" title="งานใหม่" aria-label="งานใหม่" onClick={() => setIdeaOpen(true)}>
        <Plus size={22} />
      </button>

      {/* key = ผูก state ของฟอร์มกับการ์ดใบนั้น — สลับการ์ดต้องได้ instance ใหม่
          ไม่งั้นค่าที่แก้ค้างของใบเก่าจะติดมาและทับข้อมูลใบใหม่ตอนกดบันทึก */}
      {liveCard && <CardSheet key={liveCard.id} card={liveCard} onClose={() => setOpenCard(null)} />}
      {ideaOpen && <IdeaModal onClose={() => setIdeaOpen(false)} onCreated={(c) => setOpenCard(c)} />}

      <Toaster />
      {toastState && <div className={`toast on ${toastState.kind}`} key={toastState.id}>{toastState.msg}</div>}
    </div>
  );
}

import { lazy, Suspense } from "react";
import { useApp } from "./useMkt.jsx";
import { MktStyles, Toaster } from "./mktUi.jsx";
import "./mktStyles.css";

const AdsView = lazy(() => import("./ads/AdsView.jsx").then((m) => ({ default: m.AdsView })));
const CampaignsView = lazy(() => import("./campaigns/CampaignsView.jsx").then((m) => ({ default: m.CampaignsView })));

export default function MarketingModule({ view = "ads" }) {
  const { toastState } = useApp();
  return (
    <div className="mkt-root">
      <MktStyles />
      <Suspense fallback={<div className="empty">กำลังโหลด…</div>}>
        {view === "campaigns" ? <CampaignsView /> : <AdsView />}
      </Suspense>
      <Toaster />
      {toastState && <div className={`toast on ${toastState.kind}`} key={toastState.id}>{toastState.msg}</div>}
    </div>
  );
}

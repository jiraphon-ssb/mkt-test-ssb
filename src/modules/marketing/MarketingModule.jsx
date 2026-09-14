import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "./useMkt.jsx";
import { MktStyles, Toaster } from "./mktUi.jsx";
import { AdsSectionTabs } from "./ads/AdsSectionTabs.jsx";
import "./mktStyles.css";

const AdsView = lazy(() => import("./ads/AdsView.jsx").then((m) => ({ default: m.AdsView })));
const CampaignsView = lazy(() => import("./campaigns/CampaignsView.jsx").then((m) => ({ default: m.CampaignsView })));
const CreativeLibraryView = lazy(() => import("./creatives/CreativeLibraryView.jsx").then((m) => ({ default: m.CreativeLibraryView })));
const SyncStatusView = lazy(() => import("./ads/SyncStatusView.jsx").then((m) => ({ default: m.SyncStatusView })));

export default function MarketingModule({ view = "ads" }) {
  const { toastState } = useApp();
  const { search } = useLocation();
  const settingsOpen = view === "ads" && new URLSearchParams(search).get("panel") === "settings";
  return (
    <div className="mkt-root">
      <MktStyles />
      <div className={settingsOpen ? "" : "ads-suite"}>
        {!settingsOpen && <AdsSectionTabs />}
        <Suspense fallback={<div className="empty">กำลังโหลด…</div>}>
          {view === "campaigns" ? <CampaignsView /> : view === "creatives" ? <CreativeLibraryView /> : view === "sync" ? <SyncStatusView /> : <AdsView />}
        </Suspense>
      </div>
      <Toaster />
      {toastState && <div className={`toast on ${toastState.kind}`} key={toastState.id}>{toastState.msg}</div>}
    </div>
  );
}

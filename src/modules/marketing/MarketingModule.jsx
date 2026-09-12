import { lazy, Suspense } from "react";
import { useApp } from "./useMkt.jsx";
import { MktStyles, Toaster } from "./mktUi.jsx";
import "./mktStyles.css";

const AdsView = lazy(() => import("./ads/AdsView.jsx").then((module) => ({ default: module.AdsView })));

export default function MarketingModule() {
  const { toastState } = useApp();

  return (
    <div className="mkt-root">
      <MktStyles />
      <Suspense fallback={<div className="empty">กำลังโหลด Overview ads…</div>}>
        <AdsView />
      </Suspense>
      <Toaster />
      {toastState && <div className={`toast on ${toastState.kind}`} key={toastState.id}>{toastState.msg}</div>}
    </div>
  );
}

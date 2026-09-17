import { BarChart3, Images, LayoutList, Presentation, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./adsSectionTabs.css";

const TABS = [
  ["/mkt/ads", "ภาพรวม", BarChart3],
  ["/mkt/report", "รายงานประชุม", Presentation],
  ["/mkt/campaigns", "แคมเปญ", LayoutList],
  ["/mkt/creatives", "Creative", Images],
  ["/mkt/ads/sync", "สถานะ Sync", RefreshCw],
];

export function AdsSectionTabs() {
  return <div className="ads-section-tabs-wrap"><nav className="ads-section-tabs" aria-label="ส่วนของ Overview ads">{TABS.map(([to, label, Icon]) => <NavLink key={to} to={to} end><Icon size={15} /><span>{label}</span></NavLink>)}</nav></div>;
}

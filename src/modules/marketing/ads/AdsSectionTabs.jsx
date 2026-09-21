import { BarChart3, Images, LayoutList, ReceiptText, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import "./adsSectionTabs.css";

const TABS = [
  ["/mkt/ads", "ภาพรวม", BarChart3],
  ["/mkt/campaigns", "แคมเปญ", LayoutList],
  ["/mkt/creatives", "Creative", Images],
  ["/mkt/ads/sync", "สถานะ Sync", RefreshCw],
];
/* แท็บบิลเป็นข้อมูลการเงิน — เห็นเฉพาะ team_lead (ข้อเคาะ 22 ก.ย. · RLS ฝั่งฐานคุมอีกชั้น) */
const LEAD_TABS = [["/mkt/ads/billing", "บิล & กระทบยอด", ReceiptText]];

export function AdsSectionTabs() {
  const { user } = useAuth();
  const tabs = user?.role === "team_lead" ? [...TABS, ...LEAD_TABS] : TABS;
  return <div className="ads-section-tabs-wrap"><nav className="ads-section-tabs" aria-label="ส่วนของ Overview ads">{tabs.map(([to, label, Icon]) => <NavLink key={to} to={to} end><Icon size={15} /><span>{label}</span></NavLink>)}</nav></div>;
}

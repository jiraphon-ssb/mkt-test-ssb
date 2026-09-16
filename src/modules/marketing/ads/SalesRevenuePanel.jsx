/* ยอดขายจริงจากระบบขาย (P&L) เทียบกับค่าแอด — ขึ้นเฉพาะเมื่อมีข้อมูลจริงในช่วงที่ดูอยู่
   ตัวเลขนี้คนละนิยามกับ "ยอดขาย" ที่ Meta attribute: ของ Meta คือมูลค่าที่ระบบโฆษณามองเห็น
   ส่วนอันนี้คือรายได้ที่รับรู้ตามบัญชี (วันจ่ายงวดแรก) ซึ่งเป็นตัวที่ใช้ตัดสินใจจริง */
import { funnelCompareRows, goalSource, goalsFromSales, realRoasRows, salesRevenueByBrand } from "./salesFacts.js";

const BRAND_CODE = { TD: "b_td", JD: "b_jk", TA: "b_ta", JK: "b_jt" };
const money = (value) => value == null ? "—" : `฿${Math.round(value).toLocaleString("th-TH")}`;
const times = (value) => value == null ? "—" : `${value.toFixed(1)}×`;
const count = (value) => value == null ? "—" : value.toLocaleString("th-TH");

const pct = (value) => value == null ? "—" : `${Math.round(value * 100)}%`;

export function SalesRevenuePanel({ brands = [], sales = [], salesGoals = [], range, rangeLabel }) {
  const byBrand = salesRevenueByBrand(sales, range ?? {});
  if (!byBrand.size) return null;
  const entries = brands.map((brand) => ({ brandId: brand.id, brand: brand.name, spend: brand.spend, metaLeads: brand.leads ?? null }));
  const rows = realRoasRows(entries, byBrand);
  // เฟส 2 — มี funnel จากระบบขายเมื่อไหร่ ค่อยโชว์คอลัมน์เทียบคนทัก
  const funnel = funnelCompareRows(entries, sales, range ?? {});
  const hasFunnel = funnel.some((row) => row.inquiries);
  const goals = goalsFromSales(salesGoals.map((goal) => ({ ...goal, brand: Object.keys(BRAND_CODE).find((code) => BRAND_CODE[code] === goal.brand_id) })));
  const total = rows.reduce((sum, row) => ({
    spend: (sum.spend ?? 0) + (row.spend ?? 0),
    revenue: row.revenue == null ? sum.revenue : (sum.revenue ?? 0) + row.revenue,
    orders: row.orders == null ? sum.orders : (sum.orders ?? 0) + row.orders,
  }), { spend: 0, revenue: null, orders: null });
  const totalRoas = total.spend > 0 && total.revenue != null ? total.revenue / total.spend : null;

  const goalLine = brands.map((brand) => ({ brand, goal: goalSource(brand.id, goals, null) })).filter((entry) => entry.goal.source === "sales");

  return <section className="aw-panel aw-sales" aria-label="ยอดขายจริงจากระบบขาย">
    <div className="aw-section-label">ยอดขายจริง <span className="zinc">{rangeLabel}</span></div>
    <div className="aw-sales-head">
      <div><span>ยอดขายจริง</span><b>{money(total.revenue)}</b></div>
      <div><span>ค่าแอด</span><b>{money(total.spend)}</b></div>
      <div><span>ROAS จริง</span><b>{times(totalRoas)}</b></div>
      <div><span>ออเดอร์</span><b>{count(total.orders)}</b></div>
    </div>
    <div className="aw-table-scroll"><table className="aw-comparison">
      <thead><tr><th>แบรนด์</th><th>ยอดขายจริง</th><th>ค่าแอด</th><th>ROAS จริง</th><th>ออเดอร์</th><th>ยอดต่อออเดอร์</th><th>ค่าได้ลูกค้า</th>
        {hasFunnel && <><th>ทักจาก Meta</th><th>เข้าระบบขาย</th><th>ลีดจริง</th><th>CPL จริง</th></>}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={row.brandId}>
        <th>{row.brand}</th>
        <td>{money(row.revenue)}</td>
        <td>{money(row.spend)}</td>
        <td>{times(row.roas)}</td>
        <td>{count(row.orders)}</td>
        <td>{money(row.aov)}</td>
        <td>{money(row.cac)}</td>
        {hasFunnel && <><td>{count(funnel[i]?.metaLeads ?? null)}</td><td>{count(funnel[i]?.inquiries ?? null)}<small> · {pct(funnel[i]?.reachedSystem ?? null)}</small></td><td>{count(funnel[i]?.leads ?? null)}</td><td>{money(funnel[i]?.cpl ?? null)}</td></>}
      </tr>)}</tbody>
    </table></div>
    {goalLine.length > 0 && <dl className="aw-facts aw-sales-goals">{goalLine.map(({ brand, goal }) => <div key={brand.id}>
      <dt>เป้า {brand.name} <small>จากระบบขาย v{goal.version}</small></dt>
      <dd>{money(goal.revenue)}<small> · งบแอด {money(goal.budget)}{goal.roas != null ? ` · ROAS ${goal.roas.toFixed(1)}×` : ""}</small></dd>
    </div>)}</dl>}
    <p className="aw-key">รายได้นับตามวันจ่ายงวดแรกเหมือนงบ P&amp;L (รวมการแก้ยอด/ยกเลิกย้อนหลัง) · แบรนด์ที่ยังไม่มีข้อมูลขึ้น “—” ไม่ใช่ ฿0 · ตัวเลขนี้คนละนิยามกับยอดขายที่ Meta มองเห็น</p>
  </section>;
}

import { Plus, Trash2 } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { CREATIVE_RULE_METRICS, MAX_CREATIVE_RULES, RULE_OPS, RULE_PLACEHOLDER, RULE_UNIT_TEXT, describeRule, newRuleId, normalizeCreativeRules, parseRuleNumber } from "./creativeRules.js";

const METRIC_OPTIONS = CREATIVE_RULE_METRICS.map((m) => [m.key, m.label]);
const unitKey = (metric) => CREATIVE_RULE_METRICS.find((m) => m.key === metric)?.unit;
const unitOf = (metric) => RULE_UNIT_TEXT[unitKey(metric)] || (metric === "leads" ? "คน" : "ครั้ง");

/* แก้ไขกฎคัดครีเอทีฟในหน้าตั้งค่า (แท็บกฎ) — ช่องตัวเลขเป็นช่องข้อความ (inputMode decimal) เก็บข้อความระหว่างพิมพ์
   รับ "1,000" / "3x" / "฿500" ได้ (ช่อง type=number ของบางเบราว์เซอร์ทิ้งค่าที่มีคอมมา/ตัวอักษรเงียบๆ เหลือค่าว่าง)
   แปลงเป็นตัวเลขตอนบันทึก (normalizeCreativeRules) · ว่าง/อ่านไม่ออก = เตือนที่ช่องทันที */
export function CreativeRulesEditor({ rules, setRules, brands = [], disabled = false }) {
  const update = (id, patch) => setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  const add = () => setRules((current) => current.length >= MAX_CREATIVE_RULES ? current : [...current, { id: newRuleId(), name: "", brandId: "all", metric: "cpa", op: "lte", value: "", minSpend: "" }]);
  const remove = (id) => setRules((current) => current.filter((rule) => rule.id !== id));
  const brandOptions = [["all", "ทุกแบรนด์"], ...brands.map((b) => [b.id, b.name])];
  return <section className="acc-sheet acc-creative-rules">
    <header className="acc-sheet-head"><div><span className="acc-kicker">CREATIVE RULES</span><h2>กฎคัดครีเอทีฟ</h2><p>ตั้งเกณฑ์ว่าค่าแอดที่ใช้ไปคุ้มกับผลหรือไม่ แล้วใช้กรองในหน้าคลัง Creative · ตัวเลขเป็นของ Meta (การซื้อและ ROAS ตาม attribution ของ Meta)</p></div>
      <button type="button" className="acc-rule-add" onClick={add} disabled={disabled || rules.length >= MAX_CREATIVE_RULES}><Plus size={14} /> เพิ่มกฎ</button></header>
    {rules.length === 0
      ? <p className="acc-rule-empty">ยังไม่มีกฎ · ตัวอย่าง: ต้นทุนต่อการซื้อไม่เกิน ฿1,000 เมื่อใช้เงินแล้วอย่างน้อย ฿500 · CTR อย่างน้อย 1% · ความถี่เฉลี่ยรายวันไม่เกิน 3×</p>
      : <ol className="acc-crule-list">{rules.map((rule, i) => {
        const n = i + 1;
        const [preview] = normalizeCreativeRules([rule]);
        const parsedValue = parseRuleNumber(rule.value);
        const parsedMin = parseRuleNumber(rule.minSpend);
        const problem = Number.isNaN(parsedValue) ? "ค่าเกณฑ์ต้องเป็นตัวเลข เช่น 1,000"
          : Number.isNaN(parsedMin) ? "ใช้เงินขั้นต่ำต้องเป็นตัวเลข เช่น 500"
            : parsedValue == null ? "ยังไม่ใส่ค่าเกณฑ์ · กฎนี้ยังไม่ถูกใช้กรอง" : null;
        return <li key={rule.id} className="acc-crule">
          <div className="acc-crule-grid">
            <label><span>ชื่อกฎ</span><input type="text" aria-label={`ชื่อกฎ ${n}`} placeholder="ไม่ใส่ก็ได้" value={rule.name ?? ""} disabled={disabled} onChange={(e) => update(rule.id, { name: e.target.value })} /></label>
            <label><span>แบรนด์</span><Dropdown className="dd--block" ariaLabel={`แบรนด์ กฎ ${n}`} options={brandOptions} value={rule.brandId ?? "all"} onChange={(brandId) => update(rule.id, { brandId })} /></label>
            <label><span>ตัวชี้วัด</span><Dropdown className="dd--block" ariaLabel={`ตัวชี้วัด กฎ ${n}`} options={METRIC_OPTIONS} value={rule.metric} onChange={(metric) => update(rule.id, { metric, op: CREATIVE_RULE_METRICS.find((m) => m.key === metric).defaultOp })} /></label>
            <label><span>เงื่อนไข</span><Dropdown className="dd--block" ariaLabel={`เงื่อนไข กฎ ${n}`} options={RULE_OPS} value={rule.op} onChange={(op) => update(rule.id, { op })} /></label>
            <label><span>ค่าเกณฑ์</span><div className="acc-input-unit"><input type="text" inputMode="decimal" aria-label={`ค่าเกณฑ์ กฎ ${n}`} aria-invalid={parsedValue == null || Number.isNaN(parsedValue)} placeholder={RULE_PLACEHOLDER[unitKey(rule.metric)]} value={rule.value ?? ""} disabled={disabled} onChange={(e) => update(rule.id, { value: e.target.value })} /><b>{unitOf(rule.metric)}</b></div></label>
            <label><span>ใช้เงินขั้นต่ำ</span><div className="acc-input-unit"><input type="text" inputMode="decimal" aria-label={`ใช้เงินขั้นต่ำ กฎ ${n}`} aria-invalid={Number.isNaN(parsedMin)} placeholder="0" value={rule.minSpend ?? ""} disabled={disabled} onChange={(e) => update(rule.id, { minSpend: e.target.value })} /><b>บาท</b></div></label>
            <button type="button" className="acc-crule-remove" aria-label={`ลบกฎ ${n}`} onClick={() => remove(rule.id)} disabled={disabled}><Trash2 size={15} /></button>
          </div>
          <small className={problem ? "acc-crule-incomplete" : undefined} role={problem ? "status" : undefined}>{problem ?? describeRule(preview)}</small>
        </li>;
      })}</ol>}
    <p className="acc-rule-help">ต้นทุนต่อผล (การซื้อ · ผลลัพธ์ที่ตั้งใน Meta · คลิกทั้งหมด): ถ้ายังไม่มีผลเลยแต่ใช้เงินเกินเพดานแล้ว นับว่าไม่ผ่าน · ใช้เงินยังไม่ถึงขั้นต่ำ = ยังตัดสินไม่ได้</p>
  </section>;
}

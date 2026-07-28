/* ============================================================
 RejectModal — ตีกลับการ์ด (ใช้ร่วมทุกที่ที่ตัดสินได้)
 กติกาเหล็ก: ไม่กรอกเหตุผล + ไม่อ้างข้อ Direction Pack = ส่งไม่ได้
 มีตัวเดียวในระบบ เพื่อให้ทุกทางเข้า (คิวรอตรวจ / ลิสต์ / การ์ด) บังคับเหมือนกัน
 ============================================================ */
import { useState } from "react";
import { useApp } from "../useMkt.jsx";
import { DIRECTION_PACK_RULES } from "../mktEngine.js";
import { validateReject } from "../mktRules.js";
import { Sheet, Field, SheetActions } from "./Sheet.jsx";
import { MktSelect } from "../mktSelect.jsx";

/* จัดกลุ่มตาม "ส่วนที่ N" ของเอกสาร — dropdown อ่านเป็นหมวด ไม่ใช่ลิสต์ยาวปนกัน */
const SECTIONS = DIRECTION_PACK_RULES.reduce((acc, r) => {
  const sec = r.slice(0, r.indexOf(" — "));
  const found = acc.find(([s]) => s === sec);
  if (found) found[1].push(r);
  else acc.push([sec, [r]]);
  return acc;
}, []);
export function RejectModal({ card, onClose, onDone, }) {
  const { rejectCard } = useApp();
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const isNew = ref === "new";
  const check = validateReject({ reason, direction_pack_ref: ref });
  const dirty = reason.trim() !== "" || ref !== "";
  return (<Sheet eyebrow={card.id} title="ตีกลับ — ต้องอ้างกติกาได้" onClose={onClose}
   dirty={dirty} dirtyMessage="เขียนเหตุผลตีกลับไว้แล้วแต่ยังไม่ได้ส่ง — ปิดแล้วข้อความจะหายไป"
   footer={<SheetActions primaryLabel="ตีกลับ → Draft" onPrimary={() => {
        rejectCard(card.id, { reason, direction_pack_ref: ref });
        onClose();
        onDone?.();
      }} primaryDisabled={!check.ok} secondaryLabel="ยกเลิก" onSecondary={onClose} danger help="ไม่กรอกเหตุผล + ไม่อ้างข้อ = ส่งไม่ได้"/>}>
   <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-soft)", marginBottom: 4 }}>"{card.title}"</div>

   <Field label="ตรงกับข้อไหนใน Direction Pack" required>
    <MktSelect value={ref} onChange={setRef} placeholder="— เลือกข้อที่อ้างอิง —" options={[
      ...SECTIONS.map(([sec, rules]) => ({
        group: sec,
        options: rules.map((r) => ({ value: r, label: r.slice(r.indexOf("— ") + 2) })),
      })),
      { group: "อื่นๆ", options: [{ value: "new", label: "ชี้ไม่ได้ — กติกายังไม่มีในเอกสาร", hint: "เข้าวาระเติม" }] },
    ]}/>
   </Field>

   <Field label="เหตุผล / จุดที่ให้แก้" required
    hint='เขียนให้ Owner แก้ได้โดยไม่ต้องถามกลับ — ระบบจะปักหมุดข้อความนี้เป็น "โน้ตตีกลับ" บนการ์ดให้อัตโนมัติ'>
    <textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)}
     placeholder={"จุดที่ผิด: อะไร อยู่ตรงไหน (ภาพที่เท่าไร / วินาทีที่เท่าไร)\nต้องแก้เป็น: บอกปลายทางให้ชัด\nตัวอย่าง/อ้างอิง: ลิงก์หรือชื่องานที่ทำถูกแล้ว"}/>
    {reason.trim() === "" && (<button type="button" className="btn ghost small" style={{ marginTop: 6 }}
      onClick={() => setReason("จุดที่ผิด: \nต้องแก้เป็น: \nตัวอย่าง/อ้างอิง: ")}>
      แทรกโครงร่าง 3 หัวข้อ
     </button>)}
   </Field>

   {isNew && (<div className="dp-note">
     ชี้ข้อไม่ได้ = เพิ่มกติกาเข้า Direction Pack ก่อน แล้วค่อยอ้างข้อใหม่ —
     ระบบจะขึ้นรายการรอเติมให้ในไทล์ "ต้องเคลียร์"
    </div>)}
  </Sheet>);
}

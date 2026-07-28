/* ============================================================
 เรื่องที่ต้องจัดการก่อน — การ์ดเดียวจบ แสดงครบทุกข้อ เลื่อนดูในการ์ดได้
 ใช้ component กลาง <Panel>/<Chip>/<Row> ของโมดูล ไม่มี CSS เฉพาะกิจของตัวเอง
 ข้อที่ด่วนสุดอยู่บนสุดพร้อมปุ่มลงมือ · ที่เหลือเป็นแถวกดได้ทั้งแถว
 ============================================================ */
import { Panel, Chip, Row } from "../mktCard.jsx";
import { Icon } from "../mktIcon.jsx";

/** ระดับความด่วน → ป้าย + โทนสีของ component กลาง */
const SEV = {
  critical: { label: "ด่วน", tone: "critical" },
  warn: { label: "ควรดู", tone: "warn" },
  good: { label: "ดี", tone: "good" },
  info: { label: "สังเกต", tone: "info" },
};
const sevOf = (s) => SEV[s] ?? SEV.info;

export function InsightCta({ items = [], onAct }) {
  const [top, ...rest] = items;

  if (!top) {
    return (
      <Panel title="เรื่องที่ต้องจัดการก่อน">
        <Row
          title={<><Chip tone="good">ปกติ</Chip> ไม่มีเรื่องด่วน</>}
          sub="ตัวเลขทุกมิติอยู่ในเกณฑ์ — โฟกัสงานที่ค้างในสายได้เลย"
        />
      </Panel>
    );
  }

  const t = sevOf(top.severity);
  return (
    <Panel
      title="เรื่องที่ต้องจัดการก่อน"
      count={items.length > 1 ? items.length : undefined}
      tone={t.tone}
      info={{ label: "เรื่องด่วน", text: "อ่านจากตัวเลขจริงในระบบ เรียงตามความเร่งด่วน · จะไม่สรุปถ้างานในกลุ่มนั้นน้อยกว่า 3 ชิ้น" }}
      scroll
      maxH={420}
      bodyClass="ins-body"
    >
      <Row
        tone={t.tone}
        title={<><Chip tone={t.tone}>{t.label}</Chip> {top.title}</>}
        sub={top.detail}
        chips={top.evidence}
      >
        {top.action?.screen && (
          <button className="btn primary ins-act" onClick={() => onAct(top)}>
            {top.action.label} <Icon name="arrow" size={15}/>
          </button>
        )}
      </Row>

      {rest.map((i) => {
        const s = sevOf(i.severity);
        return (
          <Row
            key={i.id}
            tone={s.tone}
            onGo={i.action?.screen ? () => onAct(i) : undefined}
            title={<><Chip tone={s.tone}>{s.label}</Chip> {i.title}</>}
            sub={i.detail}
            chips={i.evidence}
          />
        );
      })}
    </Panel>
  );
}

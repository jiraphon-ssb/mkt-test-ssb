# Ads ข้อมูลจริง (Meta Pilot) — Design

วันที่ 14 ก.ย. 2026 · สถานะ: อนุมัติแล้ว ("ตามนี้ได้") · ขอบเขตรอบนี้ = ข้อ 1–3 · ข้อ 4–6 รอบถัดไป

## เป้าหมาย
เปลี่ยนหน้า Overview · แคมเปญ · Creative จากข้อมูลจำลองเป็นยอดจริงจาก Meta Ads (อ่านอย่างเดียว) โดยไม่เขียนตัวคำนวณ/หน้าจอใหม่ และไม่รวมยอดจำลองกับยอดจริง

## การตัดสินใจ
| เรื่อง | ตัดสินใจ |
|---|---|
| หน่วยข้อมูล | Insights รายวัน `level=ad` (มี campaign/adset/ad ในแถวเดียว) เก็บ `ad_daily_facts.level='ad'` |
| ต่อเข้าหน้าจอ | แปลงแถว facts เป็น "การ์ดแอด" รูปเดียวกับ mock (`metrics.spend/leads/revenue…`) → ตัวคำนวณเดิมใช้ต่อ |
| ผลลัพธ์ (leads) | ตาม `sourceConfig.leadEvent` ของแหล่งข้อมูล (ค่าเริ่ม `messaging_conversation_started_7d`) |
| ยอดขาย / ROAS | มูลค่า purchase ที่ Meta attribute · worker เก็บ null เมื่อแถวไม่มี purchase · หน้าจอ: บัญชีที่เคยมี purchase → แถวที่ไม่มี = 0, บัญชีที่ไม่เคยมี = null · ผลรวมที่มีใบ null = null (ไม่ใช่ ฿0) · ติดป้าย attribution |
| ช่วงดึง | backfill = "ย้อนหลัง" ในหน้าตั้งค่า (1–180 วัน · ไม่มีค่า = 30) · incremental = 3 วันล่าสุดตาม timezone ของบัญชี |
| กันซ้ำ | RPC `ads_replace_daily_facts` ลบ+ใส่ช่วงวันเดียวกันในทรานแซกชันเดียว (service role เท่านั้น) — ได้ข้อมูลไม่ครบ = ไม่เขียน และ run = failed |
| token | worker อ่าน `ad_connections.authorization_id` → ถอดรหัสฝั่ง server · browser ไม่เคยเห็น token |
| สร้าง connection | Edge Function `ads-connections` ตอน team_lead บันทึก mapping — ยอมเฉพาะบัญชีที่อยู่ใน `ad_authorized_accounts` ของผู้ใช้คนนั้น |
| สลับแหล่งข้อมูล | ข้อมูลจำลอง (ค่าเริ่ม) / Meta Pilot — เห็นปุ่มเฉพาะ team_lead · Pilot ตัดการ์ดแอดทุกใบของ mock ออกก่อนใส่ข้อมูลจริง |
| รอบ sync | ปุ่ม "ดึงข้อมูลตอนนี้" ในหน้าสถานะ Sync · cron เปิดหลังตรวจยอดผ่าน (รอบถัดไป) |
| ป้ายบนจอ | แหล่งข้อมูล · จำนวนบัญชี · อัปเดตล่าสุด · "วันนี้ยังไม่สิ้นสุด" |

## ไม่ทำรอบนี้
ตรวจยอดกับ Ads Manager (ข้อ 4) · Creative worker (ข้อ 5) · cron · Google/TikTok/Shopee · ยอดขายจริงจาก CRM

## ต้องขออนุญาตแยก (กฎข้อ 3)
push migration 0010 · deploy `ads-sync` / `ads-connections`

## เกณฑ์ผ่าน
- เทส pure ครอบ: แปลงแถว Insights · เลือก lead event · null vs 0 · ช่วงวัน · pagination · retry/rate limit · ยอมแพ้เมื่อเกินรอบ · วางแผน connection · แปลง facts → การ์ด · ไม่ผสมแหล่ง
- โหมดข้อมูลจำลองหน้าจอเหมือนเดิมทุกตัวเลข · Pilot ที่ยังไม่มีข้อมูลขึ้น empty state ไม่พัง
- tests / lint / build ผ่าน

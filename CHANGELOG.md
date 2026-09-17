# Changelog

รูปแบบตาม [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชันตาม SemVer · รายการสร้างจาก conventional commits

## [Unreleased]

### feat
- ท่อยอดขายจริงจากระบบขายของพี่ทัช: คนทัก (แยกช่องทาง + วันที่ทีมยังไม่กรอก) · ลีด · ได้ออเดอร์ · ยอดขายยืนยันแยกลูกค้าใหม่ · เงินเข้า · ยกเลิก — อ่านจาก `sale_dashboard_facts` ตัวเดียวกับแดชบอร์ดขาย ย้อน 14 วันทุกวัน
- เป้ารายเดือนจาก `sale_goal` (เวอร์ชันล่าสุด + งบแอดรายแพลตฟอร์ม) ไม่มีค่อยใช้เป้าแบบเก่า `sale_target`
- ระบบขายเป็นแหล่งของ TD · JD · TA · JUNTAKARN รอต่อจากโปรเจกต์ของตัวเอง
- หน้า Sync: การ์ดทุกแหล่งข้อมูล · ตารางความครบรายเดือน×ตัวชี้วัด×แบรนด์ · เป้าเดือนนี้ขาดช่องไหน · ประวัติรอบดึงยอดขาย/creative · สิทธิ์และคีย์ · หัวหน้าทีมสั่งตรวจ/ดึง/ดึงย้อนหลังได้
- Overview และแคมเปญยึดระบบขาย: ยอดขาย · เป้า · งบ Meta · funnel มาจากระบบขาย · ROAS / %Ads (ต่อยอดลูกค้าใหม่) ติดป้าย "คิดจากค่าแอด Meta" · คนทักแสดงคู่ ทีมกรอก | จากแอด Meta · ไม่มีข้อมูลบอกเหตุผล (ยังไม่ตั้งเป้า · รอเชื่อมแหล่งข้อมูล · ทีมยังไม่กรอก)
- ถอดแท็บ "เป้า" ออกจากหน้าตั้งค่า — เป้าทั้งหมดใช้ของหน้าเป้าหมายในระบบขาย · การตัดสินรายแคมเปญใช้เพดาน CPL จากระบบขาย

### security
- ข้อมูลลูกค้าไม่ข้ามระบบ: ขอ facts แค่ 7 คอลัมน์ตัวเลข ตัดรหัสลูกค้า/ดีล/เซลและข้อความเหตุผลตั้งแต่ฝั่งขาย และตรวจซ้ำก่อนเขียน

### fix
- กราฟแนวโน้มใน Overview ดูเหมือนยอดดิ่งเกือบ 0 ที่วันนี้ (ข้อมูลของวันนี้ยังเก็บไม่ครบ) — ตอนนี้ช่วงท้ายที่ลากเข้าวันนี้เป็นเส้นประจางพร้อมหมายเหตุ "วันนี้ยังไม่จบ"
- วันนี้ (ยังไม่จบวัน) ถูกนับเป็นวันที่ทีมไม่กรอกคนทัก — "ทีมกรอก 45/51 วัน" → 45/48 · ตารางความครบ "กรอก 16/17" → ครบ
- แท็บยอดขายในหน้า Sync รื้อใหม่: เป้าเดือนนี้เป็นตารางแบรนด์ × ช่องเป้าพร้อมตัวเลขจริง · ความครบจัดกลุ่มตามตัวชี้วัด (สถานะเหมือนกันทุกแบรนด์ยุบแถวเดียว) · ข้อมูลที่ระบบขายเพิ่งเริ่มเก็บ (ได้ออเดอร์ก่อน 1 ก.ย.) ขึ้นสีเทา "เริ่มเก็บ 1 ก.ย." แทนสีแดง · หัวคอลัมน์บอกช่วงวันจริง (18–30 มิ.ย. · ถึงวันนี้)
- แท็บประวัติแบ่งหน้าละ 20 · จัดกลุ่มตามวัน
- หน้าสถานะ Sync รื้อใหม่: สรุปบนสุดบรรทัดเดียว · เรื่องที่ควรดูพร้อมปุ่มแก้ · ตารางแหล่งข้อมูลแหล่งละแถว (สถานะ · สดแค่ไหน · ครบแค่ไหน) · รายละเอียดอยู่ในแท็บ (บัญชี Meta · ยอดขาย · สิทธิ์และคีย์ · ประวัติรวมเส้นเวลาเดียว) · งานรองย้ายไปเมนู "งานอื่น" — แก้บั๊กหน้าเดิมที่ระหว่างรอ API ขึ้น "ยังไม่เคยดึง / ยังไม่ได้เชื่อม Meta / ข้อมูลขาด" ทั้งที่ดึงสำเร็จแล้ว (ตอนนี้โหลดแยกทีละส่วนและบอกว่ากำลังตรวจ)
- กฎ "ครีเอทีฟล้า" ติดธงเกือบทุกแคมเปญ (24 แคมเปญ ความถี่แค่ 1.0–2.0) เพราะนับ CTR ครึ่งหลังตกจากตัวเลขที่น้อยจนแกว่งเอง และครีเอทีฟชิ้นเล็กชิ้นเดียวล้าก็ลากทั้งแคมเปญ — ตอนนี้ต้องเห็นอย่างน้อย 1,000 ครั้งต่อครึ่ง และแคมเปญล้าเมื่อครีเอทีฟที่ล้ากินค่าแอดเกินครึ่ง (ใช้กับหน้า Creative ด้วย)
- หน้าแคมเปญ (ข้อมูลจริง) ขึ้น "พิจารณาหยุด" กับแคมเปญทักแชทที่ CPL ดีที่สุด (฿42–92) เพราะตัดสินด้วย ROAS ที่ Meta เห็น (0.0–0.3x) — ตอนนี้ไม่ใช้ ROAS ของ Meta ตัดสินรายแคมเปญเลย ใช้ ใช้เงินไม่มีผล · ครีเอทีฟล้า · CPL เกินเพดาน และยังไม่แนะนำสเกลจนกว่าจะมียอดขายรายแคมเปญ
- กราฟ "ตัวชี้วัดและแนวโน้ม" ใน Overview แท็บยอดขาย / ROAS / คนทัก / CPL ยังคิดจากยอดที่ Meta เห็น (ขึ้น ROAS ราว 1.1× ขณะที่ด้านบนขึ้น 8.7×) — ตอนนี้ใช้ระบบขาย นิยามเดียวกับ hero และ funnel พร้อมป้ายที่มา · หน้าแบรนด์แท็บเหล่านี้แยกแพลตฟอร์มไม่ได้ (ยอดขายไม่แยกตามแพลตฟอร์มโฆษณา)
- เตือน token Meta หมดอายุล่วงหน้าไม่ได้ เพราะ `expires_at` เป็น null (Meta ไม่ส่ง `expires_in` มาตอนแลก token อายุยาว) — ตอนนี้ถามวันหมดอายุจริงจาก `/debug_token` ตอนเชื่อม Meta และตอนดึงข้อมูลวันละครั้งต่อ token · ใช้วันที่มาก่อนระหว่างวันหมดอายุ token กับวันหมดสิทธิ์เข้าถึงข้อมูล · Meta บอกว่าใช้ไม่ได้แล้ว = หยุดดึงทันทีและขึ้นให้เชื่อมใหม่
- ภาพจริงของโฆษณาแบบบูสต์โพสต์เพจไม่เคยถูกดึงเลยสักชิ้น — เพจอยู่ใต้ Business Manager จึงไม่โผล่ใน `/me/accounts` ตอนนี้หาเพจจาก Business ด้วย (ขอสิทธิ์ `business_management` เพิ่ม ต้องกดเชื่อม Meta ใหม่) และถ้ายังไม่ได้ token เพจ จะลองอ่านโพสต์ด้วย token ผู้ใช้เป็นทางสำรอง
- อัลบั้ม/carousel เคยโชว์ "ภาพที่ 1/8" แต่ภาพไม่เปลี่ยนเลย — Meta ส่ง `image_hash` มาโดยไม่มี URL ทุกชิ้นเลยใช้ภาพระดับ creative ตัวเดียวกัน ตอนนี้ขอ URL ตาม hash จาก `/act_x/adimages` มาเติม
- ชิ้นงานที่ไม่มีภาพของตัวเองเคยถูกนับว่า "มีภาพแล้ว" เพราะตัดสินจากภาพที่ระบบ fallback ให้ ทำให้ไม่มีใครไปตามหาภาพจริงมาแทน
- ขั้นดึงภาพจากโพสต์เพจเคยเหลือเวลาแค่ 20 วินาทีถ้าขั้นก่อนหน้าใช้เวลาเต็มงบ แล้วจบเงียบๆ ด้วย DEADLINE — ตอนนี้รับประกันอย่างน้อย 30 วินาที และรายงาน `needed` คู่กับ `enriched`
- ถ้าชุดภาพทุกชิ้นชี้ภาพเดียวกัน หน้าจอจะบอกว่ามีภาพเดียวตามจริง ไม่โชว์ตัวนับหลอก

### test
- เพิ่มเทสระดับหน้าจอชุดแรกของโปรเจกต์ (jsdom + @testing-library/react) ครอบตัวเลื่อนภาพ ตารางแคมเปญ และแผงประวัติ Sync — เดิมเทสทั้งหมดเป็น logic ล้วน แก้ JSX/CSS ผิดแล้วไม่มีอะไรเตือน

### a11y
- ลิ้นชักแคมเปญเคยมีปุ่มชื่อ "ปิดรายละเอียด" สองปุ่ม (พื้นหลัง + กากบาท) โปรแกรมอ่านหน้าจอจะอ่านซ้ำ — พื้นหลังเป็นพื้นที่กดของเมาส์อย่างเดียวแล้ว

### fix
- ตัวตั้งเวลาเลิกนับงานที่ล้มเหลวว่า "ทำแล้ว" — วันที่ดึงยอดขายไม่สำเร็จ ยอดของวันนั้นเคยหายถาวรเพราะรอบถัดไปข้าม (a08ff3d)
- ตรวจยอดที่ผลออกมาไม่ตรงเคยถูกสั่งตรวจใหม่ทุกชั่วโมง (~15 ครั้ง/วัน/บัญชี) ตอนนี้พัก 4 ชม. และไม่เกิน 3 ครั้ง/วัน (a08ff3d)
- รอบที่ดึงยอดขายไม่สำเร็จเคยขึ้นสถานะเขียว ตอนนี้ขึ้น partial ตามจริง (a08ff3d)

### feat
- รูป/ข้อความโฆษณารีเฟรชเองวันละครั้ง ไม่ต้องกดปุ่มเอง — บัญชีที่ค้างนานสุดได้ก่อน ครั้งละหนึ่งบัญชี (a08ff3d)

### security
- ปิด bucket `mkt-files` ไม่ให้อ่านผ่าน URL สาธารณะ — เดิมใครรู้ path ก็อ่านไฟล์ได้โดยไม่ผ่าน RLS (a08ff3d)

## [0.9.0] — 2026-09-16

**ads workspace ครบวงจรและดูแลตัวเองได้** — ดึงข้อมูลอัตโนมัติทุกชั่วโมง ตรวจยอดเองวันละครั้ง ทีมทั้งทีมเห็นยอดจริง
เลิกแสดงตัวเลขที่ระบบเดาเอง ปิดช่องโหว่สิทธิ์ฐานข้อมูล และมี CI กับ runbook เป็นครั้งแรก (24 commit ตั้งแต่ v0.8.0)

### docs
- เพิ่ม [docs/RUNBOOK.md](docs/RUNBOOK.md) — ข้อมูลไม่เข้า/ตัวเลขไม่ตรง/ตัวตั้งเวลาเงียบ ต้องทำอะไร พร้อมตารางแปล error และค่าที่ต้องตั้งทั้งหมด
- README เขียนใหม่ให้ตรงกับของจริง (เดิมยังบอกว่าเป็น SOP board ใช้ localStorage) และแก้ path ที่อ้างผิด

### ci
- vitest เคยเก็บเทสจาก worktree ชั่วคราวใต้ `.claude/` มานับด้วย ทำให้จำนวนเทสที่รายงานเกินจริง (906 → จริง **569**) — ตัดออกใน `vite.config.ts` แล้ว
- ตรึง `TZ=Asia/Bangkok` ใน CI เพราะตัวสร้างข้อมูลเดโมของหน้าเก่าอิงเวลาเครื่อง
- เพิ่ม GitHub Actions: lint + เทส + build ทุก push/PR เข้า main และกันไม่ให้แพตช์ชั่วคราว `TEMP-PREVIEW` หลุดขึ้น main

### security
- ads: ปิดสิทธิ์เขียนของ anon บนตารางเนื้อหาเก่า `mkt_*` 11 ตาราง (repo เป็น public และ anon key อยู่ในไฟล์ที่เสิร์ฟให้ทุกคน ใครก็ลบ `mkt_brand` ได้ ซึ่งจะทำให้หน้า ads พังทั้งระบบ) · bucket `mkt-files` ปิดการเขียน/ลิสต์ให้เหลือเฉพาะผู้ล็อกอิน (ตัว bucket ยังตั้งเป็น public อยู่ ซึ่งแปลว่าลิงก์ตรงไปยังไฟล์ยังอ่านได้ถ้ารู้ path — ไม่มีโค้ดส่วนไหนใช้ bucket นี้แล้ว บันทึกไว้เป็นหนี้)

### feat
- ads: เตรียมเชื่อมระบบขายครบ 3 เฟส — เฟส 2 เทียบ funnel (คนทักที่ Meta นับ vs เข้าระบบขายจริง · ลีดจริง · CPL จริง) และเฟส 3 เป้ารายเดือนจากระบบขาย (ตาราง `ad_sales_goals` อ่านอย่างเดียว) · `sales-sync` เรียกทั้ง 3 ประตู ประตูไหนยังไม่เปิดก็ข้ามโดยไม่พัง
- ads: เตรียมเชื่อมยอดขายจริงจากระบบขาย (เฟส 1) — Edge Function `sales-sync` ดึง `mkt_revenue_daily` ย้อนหลัง 14 วันลง `business_daily_facts` (source=crm) ทับด้วย `brand|day` · cron เรียกวันละครั้งหลัง 9 โมง · หน้า Overview มีกล่อง "ยอดขายจริง" แสดง ROAS จริง/ออเดอร์/ยอดต่อออเดอร์/ค่าได้ลูกค้า รายแบรนด์ · ยังไม่ตั้งคีย์ = ข้ามเงียบๆ ไม่กระทบของเดิม
- ads: ทีมเห็นยอดจริงแล้ว — สมาชิกที่ล็อกอินจริงทุกคนได้ Meta Pilot เป็นค่าเริ่ม (เดิมเห็นข้อมูลจำลองซึ่งแยกไม่ออกว่าเลขไหนจริง) · ปุ่มสลับแหล่งข้อมูลเหลือเฉพาะ team_lead · ป้ายบนหัวข้อบอกชัดว่ากำลังดู "ยอดจริง · Meta" หรือ "ข้อมูลจำลอง" · ปุ่มดูตัวอย่างโฆษณาแสดงเฉพาะคนที่มีสิทธิ์เรียกจริง
- ads: ตรวจยอดอัตโนมัติวันละครั้งต่อบัญชี (หลัง 9 โมงตามโซนเวลาบัญชี · เฉพาะบัญชีที่ข้อมูลครบ) — `ads-reconcile` รับ service role ได้แล้ว
- ads: ประวัติการทำงานของตัวดึงอัตโนมัติ — ตาราง `ad_cron_ticks` บันทึกทุกรอบรวมรอบที่ไม่มีอะไรต้องทำ เก็บ 90 วัน · หน้าสถานะ Sync มีหัวข้อ "ดึงอัตโนมัติ" บอกสถานะล่าสุด ดึงกี่ก้อน ตรวจกี่บัญชี เขียนกี่แถว ใช้เวลาเท่าไร · ตารางประวัติ Sync เพิ่มคอลัมน์ "ผู้สั่ง" (อัตโนมัติ/กดเอง)
- ads: ดึงข้อมูล Meta อัตโนมัติ — pg_cron ยิง Edge Function `ads-cron` ทุกชั่วโมง แล้วสั่ง `ads-sync` เฉพาะบัญชีที่ถึงรอบตามค่า "ดึงทุก X ชั่วโมง" ในหน้าตั้งค่า · รอบละไม่เกิน 4 ก้อน (กันชนเพดานเวลา Edge Function) · บัญชีที่ค้างนานสุดได้คิวก่อน · ไม่ยิงซ้อน run ที่กำลังวิ่ง · service role เท่านั้นที่เรียกได้ · service key อยู่ใน Vault ไม่อยู่ในโค้ด
- ads: การ์ด Creative หลายภาพเลื่อนดูได้ — ปุ่มก่อนหน้า/ถัดไป (ปลายสุดซ่อนปุ่มและย้ายโฟกัส) · ตัวนับ n / ทั้งหมด + จุดบอกตำแหน่ง · ลูกศรซ้าย/ขวา/Home/End · ปัดบนจอสัมผัส · สถานะโหลด/หมดอายุแยกต่อภาพ · โหลดภาพถัดไปรอไว้
- ads: drawer แคมเปญใช้กรอบสื่อ 1:1 ชุดเดียวกับคลัง Creative (เลื่อนภาพ + กดดูตัวอย่างโฆษณา) · ลิงก์ FB/IG · ตัวอักษรบนการ์ดใหญ่ขึ้น

### style
- ads: การ์ด Creative — สื่อกรอบ 1:1 ทั้งภาพและวิดีโอ แสดงครบทั้งชิ้น (contain) บนพื้นเบลอจากภาพเดียวกัน ข้อความบนกราฟิก 9:16/4:5/16:9 ไม่ถูกตัด · ป้ายประเภท (วิดีโอ/ภาพ/ชุดภาพ · n) · ปุ่ม play กลางภาพ · skeleton ตอนโหลด · สถานะภาพหมดอายุ/ไม่มีภาพ · แถบ "ดูตัวอย่างโฆษณา" เมื่อ hover/โฟกัส · เคารพ reduced motion · ตัวอักษรบนการ์ดใหญ่ขึ้น (เดิม 8–9px) ชื่อชิ้นงาน 2 บรรทัด

### fix
- heatmap เวลาโพสต์อ่านเป็นเวลาไทยเสมอ (เดิมใช้เวลาของเครื่องที่รัน ผลเพี้ยน 7 ชั่วโมงบนเซิร์ฟเวอร์ UTC — CI จับได้ตั้งแต่รอบแรก)
- ads: cron บัญชีเดียวที่พังเคยลากบัญชีที่เหลือหยุดตามทุกชั่วโมง (`break` ทั้งรอบ + บัญชีค้างนานสุดอยู่หัวคิวถาวร) — ตอนนี้ข้ามเฉพาะบัญชีนั้น และไม่วางแผนบัญชีที่ token หมดอายุ
- ads: Meta ตอบ 200 พร้อมข้อมูลว่างเคยลบยอดของช่วงนั้นทิ้งแล้วบันทึกว่า "สำเร็จ" — ตอนนี้ถ้าช่วงนั้นเคยมีข้อมูลจะไม่เขียนทับ และขึ้น `SYNC_EMPTY_RESULT`
- ads: cron อ่านประวัติ run แบบแบ่งหน้าแล้ว (PostgREST ตัดที่ 1,000 แถว · ตารางโตได้ ~96 แถว/วัน) กัน "ช่องว่างผี" ที่ทำให้ดึงซ้ำไม่จบ
- ads: รอบที่ crash เคยค้างสถานะ "กำลังทำงาน" ตลอดไปและหน้าจอขึ้นเขียว — ตอนนี้ปิดเป็น `CRON_CRASHED` และค้างเกิน 10 นาทีหน้าจอขึ้นว่าต้องแก้
- ads: เตือนล่วงหน้า 7 วันก่อน token Meta หมดอายุ (`META_TOKEN_EXPIRING`) และตั้งสถานะบัญชีเป็นหมดอายุเมื่อถึงกำหนด
- ads: funnel ขั้น Lead/มัดจำ/ออเดอร์ เคยคิดจากอัตราส่วนคงที่ 0.65/0.15/0.8 ทำให้ป้าย "หล่นแรงสุด" ชี้ที่มัดจำเสมอ — ตอนนี้ขึ้น "—" จนกว่าจะเชื่อมระบบขาย
- ads: ค่าที่ไม่รู้เคยขึ้น ฿0 (`fmtMoney`/`fmtInt`/`fmtCompact` ไม่กัน null) และแบรนด์ที่ยังไม่มีข้อมูลเคยขึ้น ฿0 พร้อมป้ายแดง "ช้ากว่าแผน" — ตอนนี้เป็น "—" ทั้งคู่
- ads: ติดป้ายว่างบรายแพลตฟอร์มเป็นค่าที่ระบบแบ่งจากงบแบรนด์ และยอดบนหัวหน้าแรกเป็นค่า "ตาม Meta attribute"
- ads: หน้า Creative ผ่านเกณฑ์ผิว — ตัวเลขบนการ์ดและแถบสรุป 107 จุดขยายจาก 10px เป็น 11px · ช่องติ๊ก "เทียบ" กดได้เต็มแถบ 24px (เดิม 13px)
- ads: หน้าสถานะ Sync ผ่านเกณฑ์ผิว — ตัวอักษร 8–10px 39 จุดขยายเป็น 11px · ลิงก์ในหัวแผงและปุ่มใน empty state มีพื้นที่กด ≥24px
- ธีมทั้งสอง: เพิ่ม token `--accent-solid` สำหรับพื้นทึบที่มีตัวหนังสือขาวทับ — เดิมขาวบน `--accent` ได้ 3.65 (มืด) / 3.74 (สว่าง) ตก AA ตอนนี้ 5.36 และ 6.30
- ads: หน้าแคมเปญผ่านเกณฑ์ผิว — ตัวอักษร 8–10px **169 จุด** ขยายเป็นอย่างน้อย 11px (ตัวเลขหลักขยับเป็น 13px ให้ลำดับสายตายังชัด) · ไอคอนช่องทางที่เป็นตัวอักษร (Google/Shopee) เลิกใช้สีขาวตายตัวที่ได้ contrast 3.56 มาใช้ `inkOn` คำนวณให้ · ปุ่มหน้าปัจจุบันในตัวแบ่งหน้าเดิม 3.65 ตอนนี้ผ่าน
- ads: หน้า Overview ads ผ่านเกณฑ์ผิว — ตัวอักษร 9.6–10px 28 จุดหายไปหมด (เล็กสุด 11px) · ปุ่มชื่อแบรนด์ในตารางและแท็บตัวชี้วัดมีพื้นที่กด ≥24px · ช่องติ๊ก "แยกแบรนด์" กดที่ป้ายได้
- ธีมสว่าง: `--accent-text` ขยับจาก #c64c0c เป็น #a63f08 — ข้อความสีแบรนด์บนพื้น tint เดิม contrast 4.14 ตก AA ตอนนี้ 5.52 (กระทบทุกหน้าที่ใช้ token นี้)
- ads: หน้าตั้งค่า ads ผ่านเกณฑ์ผิว — ตัวอักษร 9–10px หายไปทั้งหน้า (เล็กสุดตอนนี้ 11px) · ป้าย "เริ่มที่นี่" ในธีมสว่างเดิม contrast 4.14 ตก AA ตอนนี้ผ่าน · ช่องติ๊ก "เตรียมดึง" ขยายเป็น 18px ในพื้นที่กด 24px · คอลัมน์สถานะกว้างพอให้ป้ายอยู่บรรทัดเดียว
- ads: โหมดเดโมไม่มี error ค้างในคอนโซลแล้ว (`supabaseStore.flush` ยิง RPC ทั้งที่ยังไม่ได้ตั้งคีย์)
- ads: รัดกุมการรับ service role ตาม security review — JWT ต้องมี `exp` ที่ยังไม่หมดอายุ และ `ref` ต้องเป็นโปรเจกต์นี้เท่านั้น (เดิมไม่มี exp ก็ผ่าน) กันกรณีเผลอ deploy แบบ `--no-verify-jwt` ในอนาคต
- ads: จำนวนการซื้อ (`attributed_conversions`) หายไปเมื่อ Meta ไม่ส่งมูลค่ามาด้วย — เดิมนับจาก `action_values` ทำให้การซื้อผ่านแชท/ในแอปกลายเป็น 0 · ตอนนี้นับจาก `actions` โดยตรง (omni_purchase ก่อน) และรองรับ `onsite_conversion.purchase` · ตรวจกับ Meta แล้ว: บัญชี เพจหลัก-JK1 1–5 ก.ย. = 7/12/18/18/19 ตรงกับ Ads Manager
- ads: เอาป้าย "ภาพจากเพจ" ออก — ขึ้นบนภาพคอนเทนต์จริงด้วย ทำให้เข้าใจผิด
- ads: ปุ่ม play บนการ์ดวิดีโอกลายเป็นก้อนสีดำใหญ่บังภาพ (รับสไตล์ป้ายมุมมาโดยไม่ตั้งใจ)

## [0.8.0] — 2026-09-16

### feat
- ads: show real post images for boosted-post creatives (39e6c7d)
  - ภาพจริงของโฆษณาแบบบูสต์โพสต์เพจ (674 จาก 782 creative) — OAuth ขอสิทธิ์อ่านเพจเพิ่ม `pages_show_list` + `pages_read_engagement` (อ่านอย่างเดียว · ไม่ให้ก็ใช้งานได้ ads_read ยังเป็นตัวหลัก) · `ads-creatives` ใช้ Page access token (อยู่ในหน่วยความจำของคำขอเท่านั้น ไม่เก็บ ไม่ log) อ่าน `full_picture`/ไฟล์แนบของโพสต์ แทนรูปโปรไฟล์เพจ · อัลบั้ม = carousel · วิดีโอ = ภาพปก
  - หน้าตั้งค่าแจ้ง "เชื่อม Meta ใหม่" เมื่อการเชื่อมเดิมยังไม่มีสิทธิ์อ่านเพจ · ผลดึงข้อมูลบอกจำนวนภาพจากโพสต์

### security
- review 2026-09-16: ไม่พบช่องโหว่ · Page token อยู่ใน Map ในหน่วยความจำ ส่งเฉพาะ header ไป graph.facebook.com · ไม่อยู่ใน log/ฐาน/response · โพสต์แต่ละตัวใช้ token ของเพจตัวเองจาก story id ที่ตรวจรูปแบบ · สิทธิ์ที่เพิ่มเป็นอ่านอย่างเดียว

### Edge Functions
- deploy ใหม่: `ads-oauth-start` · `ads-creatives`

### ต้องทำหลัง deploy
- ผู้ที่เชื่อม Meta ไว้แล้ว: กด "เชื่อมใหม่" ในหน้าตั้งค่า เลือกทุกเพจที่ยิงแอด แล้วดึงข้อมูลใหม่

## [0.7.1] — 2026-09-16

### fix
- ads: parse Meta ad preview iframe src with a URL allowlist (a5d2bb8) — ตัวอย่างโฆษณาขึ้น "แสดงตัวอย่างไม่ได้" ทุกชิ้น: Meta ส่งตัวอย่างมาแล้ว แต่ตัวตรวจแบบ regex ตัวอักษรตีตก · ตรวจด้วย URL parser (https · www/business.facebook.com · path หน้าตัวอย่าง) · log รูปแบบ body เมื่อไม่ผ่านโดยไม่เผย query

### ข้อมูลที่พบ (ภาพบนการ์ด)
- 674 จาก 782 creative เป็นโฆษณาจากโพสต์เพจเดิม (object_type STATUS) — Meta ส่งแค่ภาพย่อระดับ creative ซึ่งเป็นรูปโปรไฟล์เพจ ภาพจริงของโพสต์ต้องใช้สิทธิ์ `pages_read_engagement` (รอตัดสินใจ)

### security
- review 2026-09-16: ไม่พบช่องโหว่ · ทดสอบกรณีขอบของ URL parser (backslash, percent-encoded host, trailing dot, userinfo) ไม่มีทางโหลด origin อื่น

### Edge Functions
- deploy ใหม่: `ads-preview` · `ads-creatives`

## [0.7.0] — 2026-09-16

### fix
- ads: บันทึกเป้ายอดขาย/งบในหน้าตั้งค่าแล้วตัวเลขไม่เปลี่ยน
  - สาเหตุ 1: ฐานไม่มีตาราง `ad_budgets`/`sales_targets` — `mkt_save_state` ไม่เก็บ และทุกครั้งที่โหลดหน้า store เติมค่า mock กลับ → ค่าที่บันทึกหายหลังรีเฟรช และคนอื่นไม่เห็น
  - สาเหตุ 2: งบถูกกระจายตามแพลตฟอร์มในแผน mock (เช่น JUNTAKARN = Meta+Shopee+TikTok) → โหมด Meta Pilot เห็นงบแค่ส่วนของ Meta
  - แก้: `settings.ads_control.targets` (เก็บในฐานแล้ว · migration 0009) เป็นความจริงชุดเดียว · หน้าภาพรวมและแคมเปญคำนวณงบ/เป้าเดือนนี้จาก targets ตอนอ่าน (`plansFromTargets`) แบ่งเฉพาะแพลตฟอร์มที่มีค่าแอดจริง ผลรวมเท่าค่าที่ตั้งเป๊ะ · `updateAdsControl` ไม่เขียนทับแผน mock อีก

## [Unreleased]

### feat
- ads: real creative media, Meta ad previews and pagination (7ba0807)
- ads: ตัวอย่างโฆษณาจริงจาก Meta — กดภาพบนการ์ด Creative เปิดหน้าต่างตัวอย่าง (Ad Preview API · สิทธิ์ ads_read) เล่นคลิปได้ เลือกตำแหน่ง Facebook มือถือ/คอม · Instagram ฟีด/สตอรี่ · Edge Function ใหม่ `ads-preview` คืนเฉพาะ src ของ iframe ที่ตรวจแล้ว
- ads: ลิงก์โพสต์บนการ์ดและหน้าตัวอย่าง — Facebook จาก story id · Instagram จาก permalink · หน้าปลายทาง
- ads: แบ่งหน้า — Creative Library 12/24/48 ชิ้นต่อหน้า (ค่าเริ่ม 12 · หารลงตัวกับกริด 4/3/2 คอลัมน์) · ตารางแคมเปญ 10/20/50 (ค่าเริ่ม 20) · กลับหน้า 1 เมื่อตัวกรอง/การเรียงเปลี่ยน · จำขนาดหน้า · ยอดรวมยังนับทุกหน้า · เลือกเทียบข้ามหน้าได้

### fix
- ads: ภาพบนการ์ด Creative เป็นโลโก้เพจแทนคอนเทนต์ — ขอสเปกโฆษณา (ภาพปกวิดีโอ/ภาพลิงก์/carousel) กลับมา โดยตัดทิ้งเป็นขั้นที่สองถ้า Meta ว่าหนักเกิน · ใช้ภาพของตัวโฆษณาก่อนภาพย่อระดับ creative
- ads: derive monthly budget and revenue targets from saved settings (6fa928f)

### security
- review 2026-09-16: ไม่พบช่องโหว่ · src ของ iframe ตรวจทั้ง server และ browser ยอมเฉพาะ preview_iframe.php ของ facebook.com · ลิงก์โพสต์สร้างจาก id ที่ตรวจรูปแบบ · sandbox ไม่ให้สิทธิ์เข้าถึง origin ของแอป

### Edge Functions
- deploy ใหม่: `ads-creatives` · `ads-preview` (ตัวใหม่)

## [0.6.2] — 2026-09-16

### fix
- ads: read creatives from ad account edge (Graph v26 dropped ?ids=) (1c945d1)
  - log ที่เพิ่มใน 0.6.1 เผยสาเหตุจริง: `The ids query parameter is deprecated in v26.0+` → ทุกคำขอพัง แต่ละรอบวิ่งจนหมดงบเวลา 90 วินาทีโดยไม่ได้ภาพเลย
  - อ่านโฆษณาจาก `/act_x/ads` พร้อม creative (field เบา) คัดเฉพาะ ad ที่มีค่าแอด หยุดเมื่อเจอครบ
  - Meta ไม่รับ → ถอยทีละขั้น: ภาพย่อใหญ่ → ตัวกรอง archived → ลดจำนวนต่อหน้า · rate limit/token หยุดทันที ไม่ retry
  - เรียกต่อด้วย cursor (ไม่คืน URL หน้าถัดไป)

### security
- review 2026-09-16: ไม่พบช่องโหว่ · cursor จาก client จำกัด `[A-Za-z0-9_-]` ฉีด parameter ไม่ได้ · token ไม่อยู่ใน cursor/log

### Edge Functions
- deploy ใหม่: `ads-creatives`

## [0.6.1] — 2026-09-16

### fix
- ads: make creative worker survive Meta data-size and transient errors (e8bbf83) — Creative worker ดึงภาพไม่ได้ (ทุกคำขอขึ้น `META_TEMPORARY`) — ขอ creative 50 ad พร้อมสเปกโฆษณาก้อนใหญ่ต่อคำขอหนักเกินที่ Meta รับ
  - ขอเฉพาะ field ที่หน้าจอใช้ (ภาพย่อ ภาพเต็ม ข้อความ หัวข้อ CTA ลิงก์) ตัด `object_story_spec`/`asset_feed_spec`
  - ชุดละ 25 · ชุดพัง → ลองแบบไม่ขอภาพย่อใหญ่ → แบ่งครึ่งจนเหลือทีละตัว → ตัวที่พังข้าม
  - แยก error "ลดปริมาณข้อมูล" (`META_TOO_MUCH_DATA`) ไม่ retry · error ชั่วคราว retry 1 ครั้ง 1 วินาที (เดิม 4 ครั้งรวม ~30 วินาที)
  - งบเวลา 90 วินาทีต่อคำขอ แล้วคืน nextOffset ให้หน้าเว็บเรียกต่อ
  - บันทึกข้อความ error ของ Meta ลง log ฝั่ง server (ไม่มี token) ใน `ads-creatives` · `ads-sync` · `ads-reconcile`

### security
- review 2026-09-16: ไม่พบช่องโหว่ · ยืนยันข้อความ error ที่บันทึกลง log มาจากข้อความของ Meta เท่านั้น ไม่มี token (token อยู่ใน header เท่านั้น)

### Edge Functions
- deploy ใหม่: `ads-creatives` · `ads-sync` · `ads-reconcile`

## [0.6.0] — 2026-09-15

### feat
- ads: chunked gap-filling backfill and Meta creative worker (8be952e)
  - backfill แบ่งช่วงและเติมช่องว่างอัตโนมัติ — "ดึงข้อมูลตอนนี้" ดูประวัติ run ที่สำเร็จ หาช่วงวันที่ขาดในหน้าต่าง (อย่างน้อย 31 วันเพื่อตรวจยอด 30 วัน · สูงสุด 180) แล้วดึงทีละก้อน ≤10 วัน + 3 วันล่าสุดเสมอ → บัญชีใหญ่เก็บ 90–180 วันได้โดยไม่ชนเพดาน Edge Function (HTTP 546) · ก้อนที่พังเติมเองรอบถัดไป
  - Creative worker — Edge Function `ads-creatives` ดึง creative (ภาพย่อ 600px, ข้อความ, CTA, ลิงก์) ของโฆษณาที่มีค่าแอดใน 30 วัน สูงสุด 400 ชิ้นเรียงตามค่าแอด ทีละ 100 → `ad_creatives` · Creative Library โหมด Meta Pilot แสดงภาพจริง
  - ช่อง "ช่องว่าง" ในหน้าสถานะ Sync นับจากประวัติ run จริง

### fix
- ads: `ads-sync` รับช่วงวันจาก client (≤14 วัน/ครั้ง · ไม่เกินวันนี้ · ไม่เก่ากว่า 180 วัน ตรวจฝั่ง server) · run ค้างถูกปิดหลัง 8 นาที (เดิม 15)
- ads: send Meta token only over https to graph.facebook.com (2891f52)

### security
- review 2026-09-15 (backfill แบ่งช่วง + ads-creatives): ไม่พบช่องโหว่ระดับ high/medium · แก้ตามข้อสังเกต: token ส่งเฉพาะ https · ยอมรับ: `ad_creatives` อ่านได้โดยผู้ล็อกอินทุกคน (ข้อความโฆษณาสาธารณะ + URL รูป ไม่มี token · ชั้นเดียวกับ facts)

### Edge Functions
- deploy ใหม่: `ads-sync` · `ads-creatives` (ตัวใหม่) · ทุก function ที่ใช้ `_shared/metaInsights.js` (`ads-reconcile`) เพื่อให้ได้การตรวจ https

## [0.5.0] — 2026-09-15

### feat
- ads: automatic 7/30-day spend reconciliation against Meta (00d5b76) — ตรวจยอดอัตโนมัติ (ข้อ 4) — Edge Function `ads-reconcile` เทียบค่าแอด 7/30 วัน (จบเมื่อวาน ตาม timezone บัญชี) ระหว่าง `ad_daily_facts` กับ Meta ระดับบัญชี · เกณฑ์ = "ผลต่างยอดที่ยอมรับ" ในหน้ากฎ (ค่าเริ่ม 1%) · ผลเก็บเป็น `ad_sync_runs` โหมด reconcile ไม่มี migration ใหม่
- ads: ปุ่ม "ตรวจยอด" ในหน้าสถานะ Sync และ "ตรวจยอดตอนนี้" ในแท็บตรวจยอด (team_lead) · ผ่านครบสองหน้าต่างทุกบัญชี = ปลดป้าย "รอตรวจยอด" → สถานะข้อมูลปกติ / พร้อมเปิดใช้
- กติกา: Meta = ยอดอ้างอิง · Meta เป็น 0 ผ่านเฉพาะฝั่งเราเป็น 0 · เทียบไม่ได้ = failed · ไม่ตรวจระหว่างบัญชีนั้นกำลัง sync

### fix
- ads: handle incomparable diff in reconcile UI and honor tolerance 0 (a6f37e4)

### security
- review 2026-09-15 (ads-reconcile): ไม่พบช่องโหว่ระดับ high/medium · แก้ตามข้อสังเกต: UI ไม่พังเมื่อ % ต่างเทียบไม่ได้ · tolerance 0 ใช้ได้จริง · หมายเหตุยอมรับ: ยอดรวมใน summary อ่านได้โดยผู้ล็อกอินทุกคน (ชั้นเดียวกับ facts ที่อ่านได้อยู่แล้ว)

### Edge Functions
- deploy ใหม่: `ads-reconcile`

## [0.4.1] — 2026-09-15

### fix
- ads: drop the `business` field from Meta ad-account discovery — ต้องใช้สิทธิ์ `business_management` ซึ่งระบบไม่ขอ ทำให้เชื่อมบัญชีแล้วขึ้น `OAUTH_CALLBACK_FAILED` ทั้งที่ token ถูกต้อง · เก็บ `business_id` เป็นค่าว่าง (ไม่มีส่วนไหนใช้) · เพิ่มเทสกันขอ field เกินสิทธิ์ `ads_read`

### Edge Functions
- deploy ใหม่: `ads-oauth-callback`

## [0.4.0] — 2026-09-15

### feat
- ads: let every team member connect their own Meta account (d07edd3) — สมาชิกทีมทุกคน (โปรไฟล์ active ที่ผูกผู้ใช้ Auth) เชื่อม / ดู / ยกเลิก Meta ของตัวเองได้ · team_lead เห็นและผูกบัญชีที่ทุกคนในทีมเชื่อมไว้ · ผูกแบรนด์ บันทึกตั้งค่า และดึงข้อมูลยังเป็นของ team_lead
- ads: OAuth พากลับไปหน้าเดิมที่กดเชื่อมได้หลาย origin (Vercel + localhost) ตาม `ADS_ALLOWED_ORIGINS`

### fix
- ads: role-aware ads settings and readable Edge Function errors (5562e41) — ข้อความผิดพลาดของ Edge Function เป็นภาษาไทยตามสาเหตุ (เช่น เรียกระบบหลังบ้านไม่ได้เพราะ origin ไม่อยู่ในรายชื่อ) แทน "ต้องเปิด Supabase Auth และ deploy OAuth Functions ก่อน"

### docs
- ads: member Meta connection, onboarding and multi-origin setup (e955122)

### Edge Functions (deploy ใหม่ทั้ง 6 ตัว · ไม่มี migration)
- `ads-oauth-start` · `ads-oauth-status` · `ads-oauth-disconnect` · `ads-oauth-callback` · `ads-connections` · `ads-sync`

### security
- review 2026-09-15 (สิทธิ์สมาชิก + หลาย origin): ไม่พบช่องโหว่ระดับ high/medium · แก้ตามข้อสังเกต: token ของสมาชิกที่โปรไฟล์ไม่ active แล้วไม่ถูกใช้ผูกบัญชีหรือดึงข้อมูล · ความเสี่ยงที่ยอมรับ: OAuth state ผูกกับผู้ใช้ฝั่ง server ไม่ผูกกับเบราว์เซอร์ (มีมาก่อน M1 · ตอนนี้สมาชิกเริ่ม OAuth ได้ด้วย)

## [0.3.0] — 2026-09-14

### feat
- ads: Meta Insights sync worker and connection linking (91bfada)
- ads: Meta Pilot data source switch on ads pages (a1d784c)
  - ดึง Insights รายวันระดับ ad ลง `ad_daily_facts` (Edge Function `ads-sync`) · สร้าง `ad_connections` จาก mapping ตอนบันทึกตั้งค่า (`ads-connections`) · ปุ่ม "ดึงข้อมูลตอนนี้" ในหน้าสถานะ Sync
  - ตัวเลือกแหล่งข้อมูล ข้อมูลจำลอง / Meta Pilot (team_lead) บนภาพรวม · แคมเปญ · Creative พร้อมแถบสถานะ (บัญชี · ช่วงข้อมูล · อัปเดตล่าสุด · วันนี้ยังไม่สิ้นสุด) แทนป้าย Mock data

### fix
- ads: keep unknown revenue as null instead of 0 in rollups (0268b88) — ยอดขายที่ไม่รู้ (null) ไม่ถูกนับเป็น ฿0 อีกต่อไป ทั้งช่องทาง แคมเปญ แบรนด์ ภาพรวม Creative และกราฟรายวัน

### docs
- ads: Meta Pilot sync spec, plan and setup guide (56bb141)

### ฐานข้อมูล
- migration 0010 (`20260914163737_ads_sync_worker` · dry-run บนฐานเทสใน transaction ที่ rollback ผ่านครบ): `ad_connections.authorization_id` · `ad_daily_facts.link_clicks` · `ad_sync_runs.triggered_by/summary` · กันรันซ้อน · RPC `ads_replace_daily_facts` (service_role) · ปิดการเขียน `ad_connections`/facts/runs จาก client (ถอด policy `ads_connections_admin`)
- Edge Functions ใหม่: `ads-connections` · `ads-sync` (บังคับ JWT + team_lead)

### security
- security review 2026-09-14 (commit c4e147a..56bb141): ไม่พบช่องโหว่ระดับ high/medium · ข้อสังเกตต่ำกว่าเกณฑ์: team_lead ทุกคน sync/ปิด connection ที่ใช้ token ของ team_lead อื่นได้ (ตามดีไซน์ทีมเดียว) · ตรวจ host ของ paging แต่ไม่ตรวจ protocol

## [0.2.0] — 2026-09-14

### feat
- ads: targets for ROAS, %Ads, CPL and sales funnel with progress on every ads page (b984c83)
  - หน้าตั้งค่า: เป้ารายแบรนด์ 3 กลุ่ม — เงินต่อเดือน · ประสิทธิภาพ · กรวยยอดขายต่อเดือน (คนทัก · Lead · มัดจำ · ออเดอร์ปิดแล้ว)
  - Overview ภาพรวม + รายแบรนด์ และแถบสรุปหน้าแคมเปญ แสดง "ทำได้กี่ % จากเป้า" พร้อมสถานะ ถึง/ใกล้/ต่ำกว่าเป้า
  - การ์ดประสิทธิภาพขึ้นก่อนการ์ดงบ

### fix
- ads: navigate to ads settings without reloading the app — ค่าที่บันทึกไม่หายเมื่อออกจากหน้าตั้งค่า (b81660a)
- auth: grant marketing permissions from mkt_profile in supabase auth mode (5350065)

### ฐานข้อมูล
- migration 0009: `mkt_settings.ads_control` เก็บ mapping · เป้า · กฎ ลงฐาน (เขียนได้เฉพาะ team_lead)

### security
- `mkt_settings`: ปิดการเขียนตรงผ่าน REST จาก anon/authenticated (เขียนผ่าน `mkt_save_state` เท่านั้น) · anon อ่านไม่ได้ · เพดานขนาด `ads_control`
- ความเสี่ยงที่ยอมรับ (Medium): ผู้ใช้ที่ล็อกอินแต่ไม่ใช่ team_lead ยังอ่าน `ads_control` (account id, เป้า) ได้ — ไม่มี token

## [0.1.0] — 2026-09-14

รีลีสแรกของชุด **Ads** (Overview · แคมเปญ · Creative · สถานะ Sync) บน Content Pipeline — ข้อมูลยังเป็น mock ทั้งหมด รีลีสนี้เตรียมฐานข้อมูลและ Meta OAuth (อ่านอย่างเดียว) สำหรับขั้น Pilot

### feat
- ads: adapt ads migrations and Meta OAuth functions to the deployed mkt_* schema (fc51691)
- ads: add read-only Meta OAuth foundation (3a606b1)
- ads: date range picker, dropdown menus, range-mode overview and chart fixes (12e904f)
- ads: daily mock ad cards per campaign incl. today (a1273d6)
- ads: add creative library and sync status (6b62ae9)
- ads: prepare Meta creative ingestion (654ed59)
- ads: gate live data with health checks (09e267a)
- ads: add campaign analysis controls (3915dcc)
- ads: campaign detail row with daily chart, creatives and findings (b6d7c8a)
- ads: campaigns table with saved views, totals and sorting (6823026)
- ads: campaigns route, menu and page shell (0b279d2)
- ads: shared period scope helpers (22e6b4c)
- ads: campaign decision tags, saved views, totals, sort (84f86a6)
- ads: campaignRows model (a7d6405)
- ads: campaign budget share/objective/status mock (35f2c40)

### fix
- ads: align workspace layout and navigation (3e250e8)
- ads: lock campaign drawer background (16944a3)
- ads: harden campaign reporting states (3c1ea5f)
- ads: let campaign detail row text wrap inside the table wrap (8b8fe8b)
- ads: campaigns table desktop layout — rename cp-row to avoid mktStyles collision, fit 1500px (36bdf05)
- ads: normalize campaign budget channel lookup (4565b2a)

### refactor
- ads: group workspaces under overview tabs (5c78920)
- ads: turn campaigns into decision workspace (a304daa)
- ads: rebuild campaign decision workspace (6ab9ca9)

### style
- ads: full-width suite layout, unified page headers and controls across tabs (171b417)
- ads: campaigns responsive + audit fixes (ec05b58)

### security (จาก security review 2026-09-14 — `docs/superpowers/security-review-2026-09-14-meta-oauth.md`)
- mkt_profile: trigger กัน client แก้ `auth_user_id` / `role` / `active` ทั้ง insert และ update (H1, H2) · เช็คด้วย connection role (M4)
- `mkt_save_state`: ห่อใหม่ — ต้องมี session · anon เรียกไม่ได้ · คง `auth_user_id` · ไม่ใช่ team_lead ยกระดับสิทธิ์ไม่ได้ (H3) — migration 0008
- OAuth callback: ตรวจ `returnTo` ด้วย parsed origin กัน open redirect (H4) · รหัส error แบบปิด ไม่รั่วข้อความ DB/Meta (M2) · ใช้ state ได้ครั้งเดียวแบบ atomic (L2) · CORS ไม่ fallback (L1) · pin supabase-js (L5)
- ตาราง ads อ่านได้เฉพาะ `authenticated`
- FK ของตาราง ads ไป `mkt_brand`/`mkt_profile` เป็น `NO ACTION DEFERRABLE INITIALLY DEFERRED` แทน cascade — กันข้อมูล ads หายทุกครั้งที่บันทึกบอร์ด (round 2 NEW-1)
- trigger กันลบโปรไฟล์ team_lead/ที่ผูกผู้ใช้ · wrapper `mkt_save_state` ใส่คืนโปรไฟล์ที่มีสิทธิ์ถ้า payload ไม่ส่งมา · `search_path = ''` (round 2 NEW-2, L4)

### chore
- deps: `npm audit fix` — react-router / react-router-dom / nanoid (high) ตามผล `npm audit --audit-level=high`

### ฐานข้อมูล (ยังไม่ apply ในรีลีสนี้ — ทำในขั้น deploy)
- `src/supabase/migrations/0005_ads_data.sql` · `0006_ad_creatives.sql` · `0007_meta_oauth.sql` · `0008_harden_mkt_save_state.sql` (ปรับให้เข้ากับ schema `mkt_*` ที่ deploy จริง) · rollback ใน `src/supabase/migrations/rollback/`
- Edge Functions: `ads-oauth-start` · `ads-oauth-status` · `ads-oauth-disconnect` · `ads-oauth-callback` (`--no-verify-jwt`)

### ก่อนหน้า
- ประวัติก่อน `38fd2c2` (Content Pipeline บอร์ดคอนเทนต์, การ์ด, ปฏิทิน, backfill) ยังไม่ได้ออกเป็นเวอร์ชัน — ถือเป็นฐาน 0.0.0

# Domain glossary

## Meta result

จำนวน action ตาม event ที่เลือกไว้ต่อบัญชีโฆษณา เช่น การสนทนาผ่านข้อความที่เริ่มต้น, Lead หรือ Lead (รวม) ห้ามเรียกรวมว่า “คนทัก” หรือ “Lead” โดยไม่บอก event ที่ใช้ และห้ามรวมต้นทุนต่อผลลัพธ์ของหลาย event เป็นค่าเดียว

## Meta purchase

จำนวนการซื้อที่ Meta attribution รายงาน ไม่ใช่จำนวนออเดอร์ในระบบขาย ค่า `null` หมายถึงบัญชียังไม่มีหลักฐานว่าวัดการซื้อได้ ส่วน `0` หมายถึงวัดได้แต่ช่วงนั้นไม่มีการซื้อ

## Meta purchase value

มูลค่าการซื้อจาก `action_values` ภายใต้ attribution ของ Meta ไม่ใช่ยอดขายธุรกิจ ตัวเลขนี้ใช้กับ ROAS การซื้อและ %Ads (Meta) เท่านั้น

## Purchase ROAS (Meta)

Meta purchase value ÷ ค่าแอดของช่วงและขอบเขตเดียวกัน

## %Ads (Meta)

ค่าแอด ÷ Meta purchase value ของช่วงและขอบเขตเดียวกัน ค่าไม่มีเมื่อ Meta purchase value เป็น `null` หรือศูนย์

## Average daily frequency

ผลรวม impressions รายวัน ÷ ผลรวม reach รายวัน เป็นค่าเฉลี่ยรายวันที่ถ่วงด้วย reach ไม่ใช่ frequency ของทั้งช่วงที่ใช้ unique reach

## Business sales

ยอดที่มาจากระบบขาย ใช้กับ ROAS จริงและ %Ads ของธุรกิจ ห้ามปนกับ Meta purchase value โดยไม่มีป้ายบอกแหล่งข้อมูล


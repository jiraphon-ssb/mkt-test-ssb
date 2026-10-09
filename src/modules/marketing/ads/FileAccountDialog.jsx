/* เพิ่มบัญชีโฆษณาที่ป้อนข้อมูลด้วยไฟล์ — ChatGPT ads (OpenAI ยังไม่เปิด API ให้ดึงยอด)
   และ Google Ads ระหว่างที่ยังไม่ได้เชื่อม API (9 ต.ค. 69: อาร์ตขอนำเข้าไฟล์ของ TEAMDEE ไปก่อน)
   ต้องมีบัญชีในระบบก่อนถึงจะอัปไฟล์ได้ เพราะค่าแอดทุกแถวต้องรู้ว่าเป็นของแบรนด์ไหน
   spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md */
import { useState } from "react";
import { Sheet, SheetActions } from "../detail/Sheet.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { adsErrorText } from "./adsSyncMessages.js";

/* รหัสบัญชี Google เก็บเป็นตัวเลขล้วน (ตัดขีด) ให้ตรงกับที่การเชื่อม API ใช้
   — วันที่เชื่อม API บัญชีเดียวกัน จะได้ลงแถวเดิม ไม่แตกเป็นสองบัญชี */
const PROVIDERS = {
  openai: { label: "ChatGPT Ads", idLabel: "รหัสบัญชี (Advertiser ID)", placeholder: "adacct_…", hint: <>ดูได้จาก URL ของหน้า Ads Manager ตรงส่วน <code>act=</code></>, clean: (v) => v.trim() },
  google: { label: "Google Ads", idLabel: "รหัสบัญชี (Customer ID)", placeholder: "123-456-7890", hint: <>เลข 10 หลักมุมขวาบนของหน้า Google Ads</>, clean: (v) => v.replace(/\D/g, "") },
};

export function FileAccountDialog({ brands = [], onClose, onCreated, createFn }) {
  const create = createFn ?? apiClient.ads.createFileConnection;
  const [provider, setProvider] = useState("openai");
  const meta = PROVIDERS[provider];
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const noBrands = brands.length === 0;
  const ready = !noBrands && Boolean(brandId) && meta.clean(accountId) !== "" && !saving;

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const id = meta.clean(accountId);
      const created = await create({
        provider, brandId, accountId: id,
        // ไม่ตั้งชื่อ = ใช้รหัสแทน ดีกว่าช่องว่างที่อ่านทีหลังแล้วไม่รู้ว่าบัญชีอะไร
        accountName: accountName.trim() || id,
        currency: "THB",
      });
      onCreated?.(created);
      onClose?.();
    } catch (saveError) {
      // ไม่ปิดหน้าต่างและไม่ล้างของที่กรอก — กรอกใหม่ทั้งหมดเพราะพลาดครั้งเดียวคือการลงโทษคนใช้
      setError(adsErrorText(saveError, "เพิ่มบัญชีไม่สำเร็จ — ถ้ารหัสบัญชีนี้มีอยู่แล้วจะเพิ่มซ้ำไม่ได้"));
    } finally { setSaving(false); }
  };

  return <Sheet
    eyebrow={meta.label}
    title="เพิ่มบัญชีที่ใช้ไฟล์"
    onClose={onClose}
    dirty={accountId.trim() !== "" || accountName.trim() !== ""}
    footer={<SheetActions
      primaryLabel={saving ? "กำลังบันทึก…" : "บันทึก"}
      onPrimary={save}
      primaryDisabled={!ready}
      secondaryLabel="ยกเลิก"
      onSecondary={onClose}
      help="ค่าแอดของบัญชีนี้เข้าระบบด้วยการอัปโหลดไฟล์จาก Ads Manager"
    />}>
    <div className="facc">
      {noBrands && <p className="facc-error" role="alert">ยังไม่มีแบรนด์ในระบบ — ตั้งแบรนด์ก่อนจึงจะผูกบัญชีได้</p>}
      <div className="facc-providers" role="group" aria-label="ช่องทางโฆษณา">
        {Object.entries(PROVIDERS).map(([id, item]) => (
          <button key={id} type="button" className={provider === id ? "on" : ""} aria-pressed={provider === id}
            onClick={() => setProvider(id)}>{item.label}</button>))}
      </div>
      <label className="facc-field">
        <span>แบรนด์</span>
        <Dropdown className="dd--block" ariaLabel="แบรนด์"
          options={brands.map((brand) => [brand.id, brand.name])}
          value={brandId} onChange={setBrandId} />
      </label>
      <label className="facc-field">
        <span>{meta.idLabel}</span>
        <input type="text" value={accountId} onChange={(event) => setAccountId(event.target.value)}
          placeholder={meta.placeholder} autoComplete="off" />
        <small>{meta.hint}</small>
      </label>
      <label className="facc-field">
        <span>ชื่อบัญชี</span>
        <input type="text" value={accountName} onChange={(event) => setAccountName(event.target.value)}
          placeholder="ไม่ใส่ก็ได้ — จะใช้รหัสบัญชีแทน" autoComplete="off" />
      </label>
      {error && <p className="facc-error" role="alert">{error}</p>}
    </div>
  </Sheet>;
}

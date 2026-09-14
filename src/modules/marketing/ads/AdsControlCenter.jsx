import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CircleAlert, Database, ExternalLink, Link2, LoaderCircle, LogOut, Save, Scale, ShieldAlert, Target } from "lucide-react";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { BrandMark } from "./BrandMark.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { ADS_PROVIDERS, DEFAULT_SOURCE_CONFIG, validateAdsConnection } from "./adsConnectorContract.js";
import { adsDataHealth, reconciliationRows } from "./adsDataHealth.js";
import { oauthResultMessage, stripOAuthParams } from "./adsOAuthResult.js";

const SOURCE_DETAILS = {
  meta: "Spend · Delivery · Messaging",
  google: "Spend · Traffic · Conversions",
  tiktok: "Spend · Video · Leads",
  shopee: "Spend · Orders · GMV",
};

const DEFAULT_RULES = {
  paceTolerance: 10,
  overspendLimit: 5,
  lowRoasDays: 3,
  staleHours: 6,
  missingDataHours: 12,
};

const moneyValue = (value) => Math.max(0, Number(value) || 0);
const numberValue = (value) => Math.max(0, Number(value) || 0);

function buildTargets(brands, saved) {
  return Object.fromEntries(brands.map((brand) => [brand.id, {
    revenue: saved?.[brand.id]?.revenue ?? brand.revTarget ?? 0,
    budget: saved?.[brand.id]?.budget ?? brand.budget ?? 0,
    roas: saved?.[brand.id]?.roas ?? 4,
    pctAds: saved?.[brand.id]?.pctAds ?? 20,
    cpl: saved?.[brand.id]?.cpl ?? 500,
    inquiries: saved?.[brand.id]?.inquiries ?? 0,
    qualified: saved?.[brand.id]?.qualified ?? 0,
    deposits: saved?.[brand.id]?.deposits ?? 0,
    closed: saved?.[brand.id]?.closed ?? 0,
  }]));
}

function SourceCard({ source, active, onSelect }) {
  return <button type="button" className={`acc-source ${active ? "active" : ""}`} onClick={onSelect}>
    <span className="acc-source-mark" style={{ background: source.color }}><Database size={17} /></span>
    <span><strong>{source.name}</strong><small>{SOURCE_DETAILS[source.id]}</small></span>
    <span className={`acc-state ${source.id === "meta" ? "ready" : ""}`}>{source.id === "meta" ? "เริ่มที่นี่" : "ลำดับถัดไป"}</span>
  </button>;
}

function Connections({ brands, config, setConfig, toast }) {
  const [sourceId, setSourceId] = useState("meta");
  const [oauth, setOauth] = useState({ loading: true, authorizations: [], accounts: [], error: null });
  const source = ADS_PROVIDERS.find((item) => item.id === sourceId);
  const mappings = config.mappings?.[sourceId] ?? {};
  const sourceConfig = { ...DEFAULT_SOURCE_CONFIG, ...(config.sources?.[sourceId] ?? {}) };
  const updateSource = (patch) => setConfig((current) => ({
    ...current, sources: { ...current.sources, [sourceId]: { ...sourceConfig, ...patch } },
  }));
  const updateMapping = (brandId, patch) => setConfig((current) => ({
    ...current,
    mappings: { ...current.mappings, [sourceId]: { ...mappings, [brandId]: { ...mappings[brandId], ...patch } } },
  }));

  const loadOAuth = async () => {
    setOauth((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await apiClient.ads.oauthStatus("meta");
      setOauth({ loading: false, authorizations: result.authorizations, accounts: result.accounts, error: null });
    } catch (error) {
      setOauth({ loading: false, authorizations: [], accounts: [], error: error?.message || "ตรวจสถานะ OAuth ไม่สำเร็จ" });
    }
  };
  useEffect(() => { loadOAuth(); }, []);
  const connectMeta = async () => {
    try {
      const returnTo = `${window.location.pathname}?panel=settings&tab=sources`;
      window.location.assign(await apiClient.ads.startOAuth("meta", returnTo));
    } catch (error) { toast?.(error?.message || "เริ่มเชื่อม Meta ไม่สำเร็จ", "bad"); }
  };
  const disconnectMeta = async () => {
    const authorization = oauth.authorizations[0];
    if (!authorization) return;
    try {
      await apiClient.ads.disconnectOAuth(authorization.id, true);
      await loadOAuth();
      toast?.("ยกเลิกการเชื่อมต่อ Meta แล้ว", "ok");
    } catch (error) { toast?.(error?.message || "ยกเลิกการเชื่อมต่อไม่สำเร็จ", "bad"); }
  };
  const metaConnected = oauth.authorizations.some((item) => item.status === "connected");
  const accountById = new Map(oauth.accounts.map((account) => [account.external_account_id, account]));

  return <div className="acc-connection-layout">
    <section className="acc-source-list" aria-label="แหล่งข้อมูลโฆษณา">
      {ADS_PROVIDERS.map((item) => <SourceCard key={item.id} source={item} active={item.id === sourceId} onSelect={() => setSourceId(item.id)} />)}
    </section>
    <section className="acc-sheet">
      <header className="acc-sheet-head"><div><span className="acc-kicker">บัญชีและแบรนด์</span><h2>{source.name}</h2><p>ใส่บัญชีและจับคู่กับแบรนด์ให้ถูกต้อง</p></div><a href={source.doc} target="_blank" rel="noreferrer">เอกสาร API <ExternalLink size={14} /></a></header>
      {sourceId === "meta" ? <div className={`acc-oauth ${metaConnected ? "connected" : ""}`}>
        <span className="acc-oauth-icon">{oauth.loading ? <LoaderCircle className="spin" size={18} /> : <Link2 size={18} />}</span>
        <span className="acc-oauth-copy"><strong>{oauth.loading ? "กำลังตรวจสถานะ…" : metaConnected ? "เชื่อม Meta Ads แล้ว" : "เชื่อม Meta Ads แบบอ่านอย่างเดียว"}</strong><small>{oauth.error ? "ต้องเปิด Supabase Auth และ deploy OAuth Functions ก่อน" : metaConnected ? `${oauth.accounts.length} บัญชีที่เลือกใช้ได้ · สิทธิ์ ads_read` : "ระบบอ่านรายงานและ Creative ได้ แต่แก้โฆษณาหรืองบไม่ได้"}</small></span>
        {!oauth.loading && (metaConnected
          ? <button type="button" className="acc-oauth-disconnect" onClick={disconnectMeta}><LogOut size={14} /> ยกเลิก</button>
          : <button type="button" className="acc-oauth-connect" onClick={connectMeta}><Link2 size={14} /> เชื่อมบัญชี</button>)}
      </div> : <div className="acc-callout"><CircleAlert size={17} /><span>ยังไม่เปิดเชื่อมต่อแพลตฟอร์มนี้ · บันทึก mapping เตรียมไว้ได้</span></div>}
      <details className="acc-source-options"><summary>ตัวเลือกการดึงข้อมูล</summary><div className="acc-source-config">
        <label><span>ดึงทุก</span><Dropdown className="dd--block" ariaLabel="ดึงทุก" options={[["1", "1 ชั่วโมง"], ["3", "3 ชั่วโมง"], ["6", "6 ชั่วโมง"]]} value={String(sourceConfig.syncEveryHours)} onChange={(value) => updateSource({ syncEveryHours: Number(value) })} /></label>
        <label><span>ย้อนหลัง</span><Dropdown className="dd--block" ariaLabel="ย้อนหลัง" options={[["30", "30 วัน"], ["90", "90 วัน"], ["180", "180 วัน"]]} value={String(sourceConfig.backfillDays)} onChange={(value) => updateSource({ backfillDays: Number(value) })} /></label>
        <label><span>Attribution</span><Dropdown className="dd--block" ariaLabel="Attribution" options={[["platform_default", "ตามแพลตฟอร์ม"], ["7d_click_1d_view", "7d click / 1d view"], ["1d_click", "1d click"]]} value={sourceConfig.attribution} onChange={(value) => updateSource({ attribution: value })} /></label>
        <label><span>Lead event</span><Dropdown className="dd--block" ariaLabel="Lead event" options={source.leadEvents.map((event) => [event, event])} value={sourceConfig.leadEvent ?? source.leadEvents[0]} onChange={(value) => updateSource({ leadEvent: value })} /></label>
      </div></details>
      <div className="acc-mapping-head"><span>แบรนด์</span><span>{source.accountLabel}</span><span>Timezone / เงิน</span><span>สถานะ</span></div>
      {brands.map((brand) => {
        const row = mappings[brand.id] ?? {};
        return <div className="acc-mapping-row" key={brand.id}>
          <div className="acc-brand-cell"><BrandMark brand={brand} size={30} /><strong>{brand.name}</strong></div>
          <label><span>{source.accountLabel}</span><input list={sourceId === "meta" ? "meta-oauth-accounts" : undefined} value={row.accountId ?? ""} onChange={(event) => { const accountId = event.target.value; const account = accountById.get(accountId); updateMapping(brand.id, { accountId, authorizationId: account?.authorization_id ?? row.authorizationId, oauthStatus: account ? "connected" : row.oauthStatus, accountName: account?.account_name ?? row.accountName }); }} placeholder={sourceId === "meta" && oauth.accounts.length ? "เลือกบัญชีที่เชื่อมแล้ว" : `${source.accountPrefix}000000000`} /></label>
          <div className="acc-locale"><label><span>Timezone</span><Dropdown className="dd--block" ariaLabel={`Timezone ${brand.name}`} options={[["Asia/Bangkok", "Asia/Bangkok"], ["UTC", "UTC"]]} value={row.timezone ?? sourceConfig.timezone} onChange={(value) => updateMapping(brand.id, { timezone: value })} /></label><label><span>Currency</span><Dropdown className="dd--block" ariaLabel={`Currency ${brand.name}`} options={[["THB", "THB"], ["USD", "USD"]]} value={row.currency ?? sourceConfig.currency} onChange={(value) => updateMapping(brand.id, { currency: value })} /></label></div>
          <div className="acc-connection-state"><span className={`acc-state ${accountById.has(row.accountId) ? "ready" : ""}`}>{accountById.has(row.accountId) ? "OAuth เชื่อมแล้ว" : "ยังไม่เชื่อมบัญชีนี้"}</span>{row.enabled && <small className={validateAdsConnection(sourceId, { ...row, timezone: row.timezone ?? sourceConfig.timezone, currency: row.currency ?? sourceConfig.currency }).ok ? "ok" : "bad"}>{validateAdsConnection(sourceId, { ...row, timezone: row.timezone ?? sourceConfig.timezone, currency: row.currency ?? sourceConfig.currency }).ok ? "Mapping พร้อม" : "กรอกไม่ครบ"}</small>}<label className="acc-enable"><input type="checkbox" checked={Boolean(row.enabled)} onChange={(event) => updateMapping(brand.id, { enabled: event.target.checked })} /><span>เตรียมดึง</span></label></div>
        </div>;
      })}
      {sourceId === "meta" && <datalist id="meta-oauth-accounts">{oauth.accounts.map((account) => <option key={`${account.authorization_id}:${account.external_account_id}`} value={account.external_account_id}>{account.account_name || account.external_account_id}</option>)}</datalist>}
    </section>
  </div>;
}

function HealthSummary({ config }) {
  const health = adsDataHealth(config);
  return <section className="acc-sheet"><header className="acc-sheet-head"><div><span className="acc-kicker">DATA HEALTH</span><h2>สถานะข้อมูล</h2><p>ระบบจะไม่ให้สถานะพร้อมใช้จนกว่าจะมีทั้งข้อมูลล่าสุดและผลตรวจยอด</p></div><span className={`acc-health-pill ${health.state}`}>{health.label}</span></header>
    <div className="acc-health-grid">{health.sources.map((source) => <article key={source.provider}><span>{source.name}</span><strong>{source.label}</strong><small>{source.detail}</small></article>)}</div>
  </section>;
}

/* ช่องเป้าแบ่ง 3 กลุ่ม — 0 = ยังไม่ตั้ง (หน้า Overview/แคมเปญจะแสดง "ยังไม่ตั้งเป้า" แทนการเดา) */
const TARGET_GROUPS = [
  ["เงินต่อเดือน", "ใช้คำนวณจังหวะยอดขาย/งบ และถ่วงน้ำหนักเป้าภาพรวม", [
    ["revenue", "เป้ายอดขาย", "฿", "before", 1000],
    ["budget", "งบโฆษณา", "฿", "before", 1000],
  ]],
  ["ประสิทธิภาพ", "ไม่ขึ้นกับความยาวช่วงเวลาที่เลือก", [
    ["roas", "ROAS ขั้นต่ำ", "×", "after", 0.1],
    ["pctAds", "%Ads สูงสุด", "%", "after", 0.1],
    ["cpl", "CPL สูงสุด", "฿", "before", 10],
  ]],
  ["กรวยยอดขายต่อเดือน", "ช่วงสั้นกว่าเดือนจะเฉลี่ยเป้าตามจำนวนวัน", [
    ["inquiries", "คนทัก", "คน", "after", 1],
    ["qualified", "Lead", "คน", "after", 1],
    ["deposits", "มัดจำ", "รายการ", "after", 1],
    ["closed", "ออเดอร์ปิดแล้ว", "ออเดอร์", "after", 1],
  ]],
];

function Targets({ brands, targets, setTargets }) {
  const update = (brandId, key, value) => setTargets((current) => ({ ...current, [brandId]: { ...current[brandId], [key]: value } }));
  return <section className="acc-sheet">
    <header className="acc-sheet-head"><div><span className="acc-kicker">MONTHLY TARGETS</span><h2>เป้าและเพดานรายแบรนด์</h2><p>ใช้บอกว่าตัวเลขบนหน้า Overview และแคมเปญ "ทำได้เท่าไรจากเป้า" · ภาพรวมทุกแบรนด์รวมจากเป้ารายแบรนด์ · ใส่ 0 = ยังไม่ตั้ง</p></div></header>
    <div className="acc-target-grid">
      {brands.map((brand) => <article className="acc-target-card" key={brand.id}>
        <header><BrandMark brand={brand} size={36} /><div><h3>{brand.name}</h3><span>สกุลเงิน THB · เดือนปัจจุบัน</span></div></header>
        {TARGET_GROUPS.map(([title, hint, fields]) => <fieldset className="acc-target-group" key={title}>
          <legend>{title}<small>{hint}</small></legend>
          <div className="acc-field-grid">
            {fields.map(([key, label, unit, side, step]) => <label key={key}><span>{label}</span><div className="acc-input-unit">
              {side === "before" && <b>{unit}</b>}
              <input type="number" min="0" step={step} value={targets[brand.id]?.[key] ?? 0} onChange={(e) => update(brand.id, key, (step < 1 ? numberValue : moneyValue)(e.target.value))} />
              {side === "after" && <b>{unit}</b>}
            </div></label>)}
          </div>
        </fieldset>)}
      </article>)}
    </div>
  </section>;
}

const RULE_FIELDS = [
  ["paceTolerance", "ช่วงยอมรับของ pace", "%", "เตือนเมื่อยอดใช้เงินจริงต่างจากจังหวะที่ควรถึงเกินค่านี้"],
  ["overspendLimit", "เพดานเกินงบ", "%", "ขึ้นสถานะวิกฤตเมื่อคาดการณ์สิ้นเดือนเกินงบมากกว่าค่านี้"],
  ["lowRoasDays", "ROAS ต่ำกว่าเป้าต่อเนื่อง", "วัน", "เตือนเมื่อ ROAS ต่ำกว่าเป้าติดต่อกันตามจำนวนวัน"],
  ["staleHours", "ข้อมูลเริ่มล่าช้า", "ชม.", "แสดงสถานะข้อมูลล่าช้าเมื่อยังไม่มีการ sync ใหม่"],
  ["missingDataHours", "ข้อมูลขาดหาย", "ชม.", "ยกระดับเป็นข้อมูลขาดเมื่อเลยเวลานี้"],
  ["reconciliationTolerance", "ผลต่างยอดที่ยอมรับ", "%", "ยอดค่าแอดจากระบบกับแพลตฟอร์มต้องต่างกันไม่เกินค่านี้"],
];

function Rules({ rules, setRules }) {
  return <div className="acc-rules-layout">
    <section className="acc-sheet"><header className="acc-sheet-head"><div><span className="acc-kicker">ALERT RULES</span><h2>กฎตัดสินใจและแจ้งเตือน</h2><p>ทุกกฎแสดงเหตุผลและค่าที่ใช้ตัดสิน เพื่อให้ทีมตรวจย้อนกลับได้</p></div></header>
      <div className="acc-rule-list">{RULE_FIELDS.map(([key, label, unit, help]) => <label className="acc-rule" key={key}><span><strong>{label}</strong><small>{help}</small></span><div className="acc-input-unit"><input type="number" min="0" value={rules[key]} onChange={(e) => setRules((current) => ({ ...current, [key]: numberValue(e.target.value) }))} /><b>{unit}</b></div></label>)}</div>
    </section>
    <aside className="acc-sheet acc-guardrails"><ShieldAlert size={22} /><h3>กฎที่ระบบต้องรักษา</h3><ul><li>งบรวมต้องเท่ากับผลรวมรายบัญชี</li><li>ยอดขายจริงใช้ CRM หรือออเดอร์เป็นหลัก</li><li>Conversion จาก Ads API ต้องติดป้ายว่าเป็นยอด Attribution</li><li>ตัวเลขที่ข้อมูลไม่ครบแสดง “—” ไม่แทนด้วยศูนย์</li><li>ทุกค่าเก็บเวลา sync และแหล่งที่มา</li></ul></aside>
  </div>;
}

const money = (value) => value == null ? "—" : `฿${Math.round(value).toLocaleString("th-TH")}`;
function CheckCell({ check }) {
  if (check.status === "pending") return <div className="acc-check pending"><strong>ยังตรวจไม่ได้</strong><small>รอข้อมูลจาก API</small></div>;
  return <div className={`acc-check ${check.status}`}><strong>{check.status === "passed" ? "ตรงกัน" : "ยอดไม่ตรง"}</strong><small>{money(check.local)} / {money(check.remote)} · ต่าง {check.diffPct.toFixed(2)}%</small></div>;
}

function Reconciliation({ config, brands }) {
  const rows = reconciliationRows(config, brands);
  return <div className="acc-reconcile-stack"><HealthSummary config={config} /><section className="acc-sheet"><header className="acc-sheet-head"><div><span className="acc-kicker">BEFORE GO-LIVE</span><h2>ตรวจยอดกับต้นทาง</h2><p>ค่าแอดในระบบต้องตรงกับแพลตฟอร์มทั้งช่วง 7 และ 30 วัน</p></div><span className="acc-tolerance">ยอมรับผลต่าง ≤ {config.rules?.reconciliationTolerance ?? 1}%</span></header>
    {rows.length ? <div className="acc-reconcile"><div className="acc-reconcile-row head"><span>บัญชี</span><span>7 วัน</span><span>30 วัน</span><span>ผล</span></div>{rows.map((row) => <div className="acc-reconcile-row" key={row.key}><div><strong>{row.brand}</strong><small>{row.provider} · {row.accountId}</small></div><CheckCell check={row.checks[0]} /><CheckCell check={row.checks[1]} /><span className={`acc-ready-state ${row.ready ? "passed" : "pending"}`}>{row.ready ? "เปิดใช้ได้" : !row.mappingValid ? "Mapping ไม่ครบ" : row.connected ? "รอตรวจยอด" : "รอเชื่อม OAuth"}</span></div>)}</div> : <div className="acc-empty-check"><Scale size={24} /><strong>ยังไม่มีบัญชีสำหรับตรวจยอด</strong><span>กลับไปเปิด “เตรียมดึง” และกรอก Account ID ก่อน</span></div>}
  </section></div>;
}

export function AdsControlCenter({ brands, saved, onSave, toast }) {
  const initial = useMemo(() => saved ?? {}, [saved]);
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState(["sources", "targets", "rules", "reconcile"].includes(requestedTab) ? requestedTab : "sources");
  /* กลับจาก Meta OAuth: callback แนบ ?oauth=success|error มา → แจ้งผลครั้งเดียวแล้วล้าง param ออกจาก URL */
  useEffect(() => {
    const result = oauthResultMessage(window.location.search);
    if (!result) return;
    toast?.(result.text, result.kind);
    setTab(result.tab);
    window.history.replaceState(null, "", stripOAuthParams(window.location.href));
  }, [toast]);
  const [config, setConfig] = useState(() => ({ mappings: initial.mappings ?? {}, sources: initial.sources ?? {} }));
  const [targets, setTargets] = useState(() => buildTargets(brands, initial.targets));
  const [rules, setRules] = useState(() => ({ ...DEFAULT_RULES, reconciliationTolerance: 1, ...(initial.rules ?? {}) }));
  const save = () => { onSave({ mappings: config.mappings, sources: config.sources, targets, rules, updatedAt: new Date().toISOString() }); toast?.("บันทึกการตั้งค่าค่าแอดแล้ว", "ok"); };
  const currentConfig = { ...config, rules };
  const health = adsDataHealth(currentConfig);
  const primaryTabs = [["sources",Link2,"1 · บัญชี"],["targets",Target,"2 · เป้า"],["rules",ShieldAlert,"3 · กฎ"],["reconcile",Scale,"4 · ตรวจยอด"]];
  return <main className="aw acc">
    <header className="acc-header"><div><Link to="/mkt/ads"><ArrowLeft size={15} /> Overview ads</Link><h1>ตั้งค่าข้อมูลโฆษณา</h1><span className={`acc-health-pill ${health.state}`}>{health.label}</span></div><button type="button" className="acc-save" onClick={save}><Save size={16} /> บันทึก</button></header>
    <nav className="acc-tabs" aria-label="หมวดการตั้งค่า Overview ads">
      {primaryTabs.map(([id,Icon,label]) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}
    </nav>
    {tab === "sources" && <Connections brands={brands} config={config} setConfig={setConfig} toast={toast} />}
    {tab === "targets" && <Targets brands={brands} targets={targets} setTargets={setTargets} />}
    {tab === "rules" && <Rules rules={rules} setRules={setRules} />}
    {tab === "reconcile" && <Reconciliation config={currentConfig} brands={brands} />}
  </main>;
}

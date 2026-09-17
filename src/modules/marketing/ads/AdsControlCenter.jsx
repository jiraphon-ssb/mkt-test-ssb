import { fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CircleAlert, Database, ExternalLink, Link2, LoaderCircle, LogOut, Save, Scale, ShieldAlert } from "lucide-react";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { BrandMark } from "./BrandMark.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { ADS_PROVIDERS, DEFAULT_SOURCE_CONFIG, validateAdsConnection } from "./adsConnectorContract.js";
import { adsDataHealth, reconciliationRows } from "./adsDataHealth.js";
import { oauthResultMessage, stripOAuthParams } from "./adsOAuthResult.js";
import { applyConnectionResult, applyReconciliation, enabledMetaMappings, latestReconcileByConnection, needsPostScopeReconnect } from "./adsConnectionSync.js";
import { adsErrorText } from "./adsSyncMessages.js";

const SOURCE_DETAILS = {
  meta: "Spend · Delivery · Messaging",
  google: "Spend · Traffic · Conversions",
  tiktok: "Spend · Video · Leads",
  shopee: "Spend · Orders · GMV",
};

const DEFAULT_RULES = {
  staleHours: 6,
  missingDataHours: 12,
};

const numberValue = (value) => Math.max(0, Number(value) || 0);

function SourceCard({ source, active, onSelect }) {
  return <button type="button" className={`acc-source ${active ? "active" : ""}`} onClick={onSelect}>
    <span className="acc-source-mark" style={{ background: source.color }}><Database size={17} /></span>
    <span><strong>{source.name}</strong><small>{SOURCE_DETAILS[source.id]}</small></span>
    <span className={`acc-state ${source.id === "meta" ? "ready" : ""}`}>{source.id === "meta" ? "เริ่มที่นี่" : "ลำดับถัดไป"}</span>
  </button>;
}

function Connections({ brands, config, setConfig, toast, isLead }) {
  const [sourceId, setSourceId] = useState("meta");
  const [oauth, setOauth] = useState({ loading: true, authorizations: [], accounts: [], teamAccounts: [], error: null });
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
      setOauth({ loading: false, authorizations: result.authorizations, accounts: result.accounts, teamAccounts: result.teamAccounts, error: null });
    } catch (error) {
      setOauth({ loading: false, authorizations: [], accounts: [], teamAccounts: [], error: adsErrorText(error, "ตรวจสถานะการเชื่อม Meta ไม่สำเร็จ") });
    }
  };
  useEffect(() => { loadOAuth(); }, []);
  const connectMeta = async () => {
    try {
      const returnTo = `${window.location.pathname}?panel=settings&tab=sources`;
      window.location.assign(await apiClient.ads.startOAuth("meta", returnTo));
    } catch (error) { toast?.(adsErrorText(error, "เริ่มเชื่อม Meta ไม่สำเร็จ"), "bad"); }
  };
  const disconnectMeta = async () => {
    const authorization = oauth.authorizations[0];
    if (!authorization) return;
    try {
      await apiClient.ads.disconnectOAuth(authorization.id, true);
      await loadOAuth();
      toast?.("ยกเลิกการเชื่อมต่อ Meta แล้ว", "ok");
    } catch (error) { toast?.(adsErrorText(error, "ยกเลิกการเชื่อมต่อไม่สำเร็จ"), "bad"); }
  };
  const metaConnected = oauth.authorizations.some((item) => item.status === "connected");
  /* team_lead ผูกบัญชีที่สมาชิกคนไหนเชื่อมไว้ก็ได้ · สมาชิกเห็นเฉพาะบัญชีจาก Meta ของตัวเอง */
  const mappable = isLead ? oauth.teamAccounts : oauth.accounts;
  const accountById = new Map(mappable.map((account) => [account.external_account_id, account]));

  return <div className="acc-connection-layout">
    <section className="acc-source-list" aria-label="แหล่งข้อมูลโฆษณา">
      {ADS_PROVIDERS.map((item) => <SourceCard key={item.id} source={item} active={item.id === sourceId} onSelect={() => setSourceId(item.id)} />)}
    </section>
    <section className="acc-sheet">
      <header className="acc-sheet-head"><div><span className="acc-kicker">บัญชีและแบรนด์</span><h2>{source.name}</h2><p>ใส่บัญชีและจับคู่กับแบรนด์ให้ถูกต้อง</p></div><a href={source.doc} target="_blank" rel="noreferrer">เอกสาร API <ExternalLink size={14} /></a></header>
      {sourceId === "meta" ? <div className={`acc-oauth ${metaConnected ? "connected" : ""}`}>
        <span className="acc-oauth-icon">{oauth.loading ? <LoaderCircle className="spin" size={18} /> : <Link2 size={18} />}</span>
        <span className="acc-oauth-copy"><strong>{oauth.loading ? "กำลังตรวจสถานะ…" : metaConnected ? "เชื่อม Meta Ads แล้ว" : "เชื่อม Meta Ads แบบอ่านอย่างเดียว"}</strong><small>{oauth.error ? oauth.error : metaConnected ? `Meta ของคุณเข้าถึง ${oauth.accounts.length} บัญชี · สิทธิ์ ads_read${isLead ? ` · บัญชีจากทั้งทีม ${oauth.teamAccounts.length}` : ""}` : isLead && oauth.teamAccounts.length ? `สมาชิกเชื่อมไว้แล้ว ${oauth.teamAccounts.length} บัญชี · เชื่อม Meta ของคุณเพิ่มได้` : "สมาชิกทีมทุกคนเชื่อม Meta ของตัวเองได้ · ระบบอ่านรายงานได้อย่างเดียว แก้โฆษณาหรืองบไม่ได้"}</small></span>
        {!oauth.loading && (metaConnected
          ? <button type="button" className="acc-oauth-disconnect" onClick={disconnectMeta}><LogOut size={14} /> ยกเลิก</button>
          : <button type="button" className="acc-oauth-connect" onClick={connectMeta}><Link2 size={14} /> เชื่อมบัญชี</button>)}
      </div> : <div className="acc-callout"><CircleAlert size={17} /><span>ยังไม่เปิดเชื่อมต่อแพลตฟอร์มนี้ · บันทึก mapping เตรียมไว้ได้</span></div>}
      {sourceId === "meta" && !oauth.loading && needsPostScopeReconnect(oauth.authorizations) && <div className="acc-callout acc-callout--action" role="status"><CircleAlert size={17} /><span><b>เชื่อม Meta ใหม่อีกครั้งเพื่อแสดงภาพโฆษณาจริง</b> · โฆษณาแบบบูสต์โพสต์เพจต้องใช้สิทธิ์อ่านเพจ (อ่านอย่างเดียว) ตอนนี้การ์ดจึงเป็นรูปโปรไฟล์เพจ · ตอนเชื่อม ให้กดยืนยันสิทธิ์เพจทุกเพจที่ยิงแอด และยืนยัน Business ที่เป็นเจ้าของเพจด้วย (เพจใต้ Business Manager ไม่โผล่ถ้าไม่ยืนยัน)</span><button type="button" className="acc-oauth-connect" onClick={connectMeta}><Link2 size={14} /> เชื่อมใหม่</button></div>}
      <details className="acc-source-options"><summary>ตัวเลือกการดึงข้อมูล</summary><div className="acc-source-config">
        <label><span>ดึงทุก</span><Dropdown className="dd--block" ariaLabel="ดึงทุก" options={[["1", "1 ชั่วโมง"], ["3", "3 ชั่วโมง"], ["6", "6 ชั่วโมง"]]} value={String(sourceConfig.syncEveryHours)} onChange={(value) => updateSource({ syncEveryHours: Number(value) })} /></label>
        <label><span>ย้อนหลัง</span><Dropdown className="dd--block" ariaLabel="ย้อนหลัง" options={[["30", "30 วัน"], ["90", "90 วัน"], ["180", "180 วัน"]]} value={String(sourceConfig.backfillDays)} onChange={(value) => updateSource({ backfillDays: Number(value) })} /></label>
        <label><span>Attribution</span><Dropdown className="dd--block" ariaLabel="Attribution" options={[["platform_default", "ตามแพลตฟอร์ม"], ["7d_click_1d_view", "7d click / 1d view"], ["1d_click", "1d click"]]} value={sourceConfig.attribution} onChange={(value) => updateSource({ attribution: value })} /></label>
        <label><span>Lead event</span><Dropdown className="dd--block" ariaLabel="Lead event" options={source.leadEvents.map((event) => [event, event])} value={sourceConfig.leadEvent ?? source.leadEvents[0]} onChange={(value) => updateSource({ leadEvent: value })} /></label>
      </div></details>
      {!isLead && <div className="acc-callout"><CircleAlert size={17} /><span>หัวหน้าทีมเป็นคนผูกบัญชีกับแบรนด์ · คุณเชื่อม Meta ของตัวเองด้านบนได้ แล้วแจ้งหัวหน้าทีมว่าเชื่อมบัญชีไหนไว้</span></div>}
      <div className="acc-mapping-head"><span>แบรนด์</span><span>{source.accountLabel}</span><span>Timezone / เงิน</span><span>สถานะ</span></div>
      {brands.map((brand) => {
        const row = mappings[brand.id] ?? {};
        return <div className="acc-mapping-row" key={brand.id}>
          <div className="acc-brand-cell"><BrandMark brand={brand} size={30} /><strong>{brand.name}</strong></div>
          <label><span>{source.accountLabel}</span><input disabled={!isLead} list={sourceId === "meta" ? "meta-oauth-accounts" : undefined} value={row.accountId ?? ""} onChange={(event) => { const accountId = event.target.value; const account = accountById.get(accountId); updateMapping(brand.id, { accountId, authorizationId: account?.authorization_id ?? row.authorizationId, oauthStatus: account ? "connected" : row.oauthStatus, accountName: account?.account_name ?? row.accountName }); }} placeholder={sourceId === "meta" && mappable.length ? "เลือกบัญชีที่เชื่อมแล้ว" : `${source.accountPrefix}000000000`} /></label>
          <div className="acc-locale"><label><span>Timezone</span><Dropdown className="dd--block" ariaLabel={`Timezone ${brand.name}`} options={[["Asia/Bangkok", "Asia/Bangkok"], ["UTC", "UTC"]]} value={row.timezone ?? sourceConfig.timezone} onChange={(value) => updateMapping(brand.id, { timezone: value })} /></label><label><span>Currency</span><Dropdown className="dd--block" ariaLabel={`Currency ${brand.name}`} options={[["THB", "THB"], ["USD", "USD"]]} value={row.currency ?? sourceConfig.currency} onChange={(value) => updateMapping(brand.id, { currency: value })} /></label></div>
          <div className="acc-connection-state"><span className={`acc-state ${accountById.has(row.accountId) ? "ready" : ""}`}>{accountById.has(row.accountId) ? "OAuth เชื่อมแล้ว" : "ยังไม่เชื่อมบัญชีนี้"}</span>{row.enabled && <small className={validateAdsConnection(sourceId, { ...row, timezone: row.timezone ?? sourceConfig.timezone, currency: row.currency ?? sourceConfig.currency }).ok ? "ok" : "bad"}>{validateAdsConnection(sourceId, { ...row, timezone: row.timezone ?? sourceConfig.timezone, currency: row.currency ?? sourceConfig.currency }).ok ? "Mapping พร้อม" : "กรอกไม่ครบ"}</small>}{row.connectionError && <small className="bad" role="alert">{adsErrorText(row.connectionError)}</small>}<label className="acc-enable"><input type="checkbox" disabled={!isLead} checked={Boolean(row.enabled)} onChange={(event) => updateMapping(brand.id, { enabled: event.target.checked })} /><span>เตรียมดึง</span></label></div>
        </div>;
      })}
      {sourceId === "meta" && <datalist id="meta-oauth-accounts">{mappable.map((account) => <option key={`${account.authorization_id}:${account.external_account_id}`} value={account.external_account_id}>{[account.account_name || account.external_account_id, account.connected_by && `เชื่อมโดย ${account.connected_by}`].filter(Boolean).join(" · ")}</option>)}</datalist>}
    </section>
  </div>;
}

function HealthSummary({ config }) {
  const health = adsDataHealth(config);
  return <section className="acc-sheet"><header className="acc-sheet-head"><div><span className="acc-kicker">DATA HEALTH</span><h2>สถานะข้อมูล</h2><p>ระบบจะไม่ให้สถานะพร้อมใช้จนกว่าจะมีทั้งข้อมูลล่าสุดและผลตรวจยอด</p></div><span className={`acc-health-pill ${health.state}`}>{health.label}</span></header>
    <div className="acc-health-grid">{health.sources.map((source) => <article key={source.provider}><span>{source.name}</span><strong>{source.label}</strong><small>{source.detail}</small></article>)}</div>
  </section>;
}

/* เฉพาะกฎที่โค้ดใช้จริง: ล่าช้า/ขาดหาย (adsDataHealth) · ผลต่างยอด (ads-reconcile)
   pace · เพดานเกินงบ · ROAS ต่ำต่อเนื่อง เคยมีช่องแต่ไม่มีโค้ดไหนอ่าน — ถอดออก 17 ก.ย. (ค่าเดิมใน settings ยังอยู่ ไม่กระทบ) */
const RULE_FIELDS = [
  ["staleHours", "ข้อมูลเริ่มล่าช้า", "ชม.", "แสดงสถานะข้อมูลล่าช้าเมื่อยังไม่มีการ sync ใหม่"],
  ["missingDataHours", "ข้อมูลขาดหาย", "ชม.", "ยกระดับเป็นข้อมูลขาดเมื่อเลยเวลานี้"],
  ["reconciliationTolerance", "ผลต่างยอดที่ยอมรับ", "%", "ยอดค่าแอดจากระบบกับแพลตฟอร์มต้องต่างกันไม่เกินค่านี้"],
];

function Rules({ rules, setRules }) {
  return <div className="acc-rules-layout">
    <section className="acc-sheet"><header className="acc-sheet-head"><div><span className="acc-kicker">ALERT RULES</span><h2>กฎตัดสินใจและแจ้งเตือน</h2><p>ทุกกฎแสดงเหตุผลและค่าที่ใช้ตัดสิน เพื่อให้ทีมตรวจย้อนกลับได้</p></div></header>
      <div className="acc-rule-list">{RULE_FIELDS.map(([key, label, unit, help]) => <label className="acc-rule" key={key}><span><strong>{label}</strong><small>{help}</small></span><div className="acc-input-unit"><input type="number" min="0" value={rules[key]} onChange={(e) => setRules((current) => ({ ...current, [key]: numberValue(e.target.value) }))} /><b>{unit}</b></div></label>)}</div>
    </section>
    <aside className="acc-sheet acc-guardrails"><ShieldAlert size={22} /><h3>กฎที่ระบบต้องรักษา</h3><ul><li>งบรวมต้องเท่ากับผลรวมรายบัญชี</li><li>ยอดขาย เป้า และ funnel มาจากระบบขาย (อ่านอย่างเดียว)</li><li>ยอดที่ Meta เห็น (Attribution) ต้องติดป้ายว่าเป็นของ Meta</li><li>ตัวเลขที่ข้อมูลไม่ครบแสดง “—” ไม่แทนด้วยศูนย์</li><li>ทุกค่าเก็บเวลา sync และแหล่งที่มา</li></ul></aside>
  </div>;
}

const money = (value) => fmtMoney(value);
function CheckCell({ check }) {
  if (check.status === "pending") return <div className="acc-check pending"><strong>ยังตรวจไม่ได้</strong><small>รอข้อมูลจาก API</small></div>;
  return <div className={`acc-check ${check.status}`}><strong>{check.status === "passed" ? "ตรงกัน" : "ยอดไม่ตรง"}</strong><small>{money(check.local)} / {money(check.remote)} · {check.diffPct == null ? "เทียบ % ไม่ได้" : `ต่าง ${check.remote ? fmtPct(Math.abs(check.local - check.remote) / Math.abs(check.remote)) : `${fmtNum(check.diffPct, 2)}%`}`}</small></div>;
}

function Reconciliation({ config, brands, toast, isLead }) {
  /* ผลจริงจากฐาน (run โหมด reconcile + สถานะ connection) ทับ config ใน state — โหมดเดโมใช้ config เดิม */
  const { demo } = useAuth();
  const [live, setLive] = useState({ connections: null, runs: [] });
  const [checking, setChecking] = useState(false);
  const loadLive = async () => {
    try {
      const [connections, runs] = await Promise.all([apiClient.ads.connections(), apiClient.ads.reconciliations()]);
      setLive({ connections: connections.filter((c) => c.provider === "meta"), runs: runs ?? [] });
    } catch { /* เดโม/ยังไม่ deploy — ใช้ค่าใน settings ตามเดิม */ }
  };
  useEffect(() => { if (!demo) loadLive(); }, [demo]); // eslint-disable-line react-hooks/exhaustive-deps
  const merged = useMemo(() => applyReconciliation(
    live.connections ? applyConnectionResult(config, { connections: live.connections }) : config,
    latestReconcileByConnection(live.runs),
  ), [config, live]);
  const checkNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const { results } = await apiClient.ads.reconcile();
      const passed = results.filter((item) => item.ok && item.summary?.passed).length;
      toast?.(passed === results.length ? `ตรวจยอดผ่านทั้ง ${passed} บัญชี` : `ตรวจยอดแล้ว · ผ่าน ${passed}/${results.length} บัญชี`, passed === results.length ? "ok" : "bad");
      await loadLive();
    } catch (error) {
      toast?.(adsErrorText(error, "ตรวจยอดไม่สำเร็จ"), "bad");
    } finally {
      setChecking(false);
    }
  };
  const rows = reconciliationRows(merged, brands);
  return <div className="acc-reconcile-stack"><HealthSummary config={merged} /><section className="acc-sheet"><header className="acc-sheet-head"><div><span className="acc-kicker">BEFORE GO-LIVE</span><h2>ตรวจยอดกับต้นทาง</h2><p>ค่าแอดในระบบต้องตรงกับแพลตฟอร์มทั้งช่วง 7 และ 30 วัน (ไม่รวมวันนี้)</p></div><div className="acc-reconcile-actions"><span className="acc-tolerance">ยอมรับผลต่าง ≤ {config.rules?.reconciliationTolerance ?? 1}%</span>{isLead && !demo && <button type="button" className="acc-reconcile-run" onClick={checkNow} disabled={checking} aria-busy={checking}>{checking ? <LoaderCircle size={14} className="spin" /> : <Scale size={14} />} {checking ? "กำลังตรวจ…" : "ตรวจยอดตอนนี้"}</button>}</div></header>
    {rows.length ? <div className="acc-reconcile"><div className="acc-reconcile-row head"><span>บัญชี</span><span>7 วัน</span><span>30 วัน</span><span>ผล</span></div>{rows.map((row) => <div className="acc-reconcile-row" key={row.key}><div><strong>{row.brand}</strong><small>{row.provider} · {row.accountId}</small></div><CheckCell check={row.checks[0]} /><CheckCell check={row.checks[1]} /><span className={`acc-ready-state ${row.ready ? "passed" : "pending"}`}>{row.ready ? "เปิดใช้ได้" : !row.mappingValid ? "Mapping ไม่ครบ" : row.connected ? "รอตรวจยอด" : "รอเชื่อม OAuth"}</span></div>)}</div> : <div className="acc-empty-check"><Scale size={24} /><strong>ยังไม่มีบัญชีสำหรับตรวจยอด</strong><span>กลับไปเปิด “เตรียมดึง” และกรอก Account ID ก่อน</span></div>}
  </section></div>;
}

export function AdsControlCenter({ brands, saved, onSave, toast }) {
  const initial = useMemo(() => saved ?? {}, [saved]);
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState(["sources", "rules", "reconcile"].includes(requestedTab) ? requestedTab : "sources");
  /* กลับจาก Meta OAuth: callback แนบ ?oauth=success|error มา → แจ้งผลครั้งเดียวแล้วล้าง param ออกจาก URL */
  useEffect(() => {
    const result = oauthResultMessage(window.location.search);
    if (!result) return;
    toast?.(result.text, result.kind);
    setTab(result.tab);
    window.history.replaceState(null, "", stripOAuthParams(window.location.href));
  }, [toast]);
  const [config, setConfig] = useState(() => ({ mappings: initial.mappings ?? {}, sources: initial.sources ?? {} }));
  const [rules, setRules] = useState(() => ({ ...DEFAULT_RULES, reconciliationTolerance: 1, ...(initial.rules ?? {}) }));
  const { demo, user } = useAuth();
  const isLead = user?.role === "team_lead";
  const [linking, setLinking] = useState(false);
  /* บันทึก settings ก่อนเสมอ แล้วค่อยให้ backend สร้าง ad_connections จาก mapping Meta (ตรวจบัญชีกับ OAuth ของผู้บันทึก)
     ผูกไม่สำเร็จ = ค่าที่กรอกยังอยู่ครบ แจ้งเหตุผลรายแบรนด์ในแถว mapping */
  const save = async () => {
    /* targets: แท็บเป้าถอดแล้ว (ข้อมูลจริงใช้เป้าระบบขาย) — เก็บค่าเดิมไว้ให้โหมดข้อมูลจำลองอ่านต่อ ไม่ลบทิ้ง */
    const next = { mappings: config.mappings, sources: config.sources, targets: initial.targets ?? {}, rules, updatedAt: new Date().toISOString() };
    onSave(next);
    const meta = next.mappings?.meta ?? {};
    const touchesMeta = Object.keys(enabledMetaMappings(next)).length > 0 || Object.values(meta).some((row) => row?.connectionId);
    if (demo || !touchesMeta) { toast?.("บันทึกการตั้งค่าค่าแอดแล้ว", "ok"); return; }
    setLinking(true);
    try {
      const result = await apiClient.ads.saveConnections(meta, next.sources?.meta ?? {});
      const merged = applyConnectionResult(next, result);
      setConfig((current) => ({ ...current, mappings: merged.mappings }));
      onSave({ ...next, mappings: merged.mappings });
      const ready = Object.values(merged.mappings.meta ?? {}).filter((row) => row?.enabled && row.connectionId && !row.connectionError).length;
      toast?.(result.errors.length ? `บันทึกแล้ว · ผูกบัญชี Meta ได้ ${ready} · มีปัญหา ${result.errors.length} แบรนด์` : `บันทึกแล้ว · ผูกบัญชี Meta พร้อมดึงข้อมูล ${ready} แบรนด์`, result.errors.length ? "bad" : "ok");
    } catch (error) {
      toast?.(`บันทึกค่าแล้ว แต่ผูกบัญชีกับระบบดึงข้อมูลไม่สำเร็จ · ${adsErrorText(error, "ลองบันทึกอีกครั้ง")}`, "bad");
    } finally {
      setLinking(false);
    }
  };
  const currentConfig = { ...config, rules };
  const health = adsDataHealth(currentConfig);
  const primaryTabs = [["sources",Link2,"1 · บัญชี"],["rules",ShieldAlert,"2 · กฎ"],["reconcile",Scale,"3 · ตรวจยอด"]];
  return <main className="aw acc">
    <header className="acc-header"><div><Link to="/mkt/ads"><ArrowLeft size={15} /> Overview ads</Link><h1>ตั้งค่าข้อมูลโฆษณา</h1><span className={`acc-health-pill ${health.state}`}>{health.label}</span></div><button type="button" className="acc-save" onClick={save} disabled={linking || !isLead} aria-busy={linking} title={isLead ? undefined : "เฉพาะหัวหน้าทีมบันทึกการตั้งค่าได้"}>{linking ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} {linking ? "กำลังผูกบัญชี…" : "บันทึก"}</button></header>
    <nav className="acc-tabs" aria-label="หมวดการตั้งค่า Overview ads">
      {primaryTabs.map(([id,Icon,label]) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}
    </nav>
    <p className="acc-goal-note" role="note">เป้ายอดขาย งบแอด และเพดาน CPL / ROAS / %Ads ใช้ของระบบขาย (หน้าเป้าหมาย) ทั้งหมด · ดูว่าเดือนนี้ตั้งช่องไหนแล้วที่ <Link to="/mkt/ads/sync">สถานะ Sync</Link></p>
    {tab === "sources" && <Connections brands={brands} config={config} setConfig={setConfig} toast={toast} isLead={isLead} />}
    {tab === "rules" && <Rules rules={rules} setRules={setRules} />}
    {tab === "reconcile" && <Reconciliation config={currentConfig} brands={brands} toast={toast} isLead={isLead} />}
  </main>;
}

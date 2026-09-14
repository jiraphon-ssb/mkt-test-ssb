/* หน้าตั้งค่า ↔ Edge Function ads-connections: เลือก mapping ที่ต้องส่ง และใส่ผลกลับเข้า settings.ads_control */

export function enabledMetaMappings(config = {}) {
  return Object.fromEntries(Object.entries(config.mappings?.meta ?? {})
    .filter(([, row]) => row?.enabled && String(row.accountId ?? "").trim()));
}

export function applyConnectionResult(config = {}, result = {}) {
  const meta = { ...(config.mappings?.meta ?? {}) };
  const disabled = new Set(result.disabled ?? []);
  for (const [brandId, row] of Object.entries(meta)) {
    if (row?.connectionId && disabled.has(row.connectionId)) {
      const { connectionId: _drop, ...rest } = row;
      meta[brandId] = { ...rest, oauthStatus: undefined };
    }
  }
  for (const connection of result.connections ?? []) {
    const row = meta[connection.brand_id];
    if (!row || String(row.accountId ?? "").trim() !== connection.external_account_id) continue;
    meta[connection.brand_id] = {
      ...row, connectionId: connection.id, oauthStatus: connection.status === "expired" ? "expired" : "connected",   // error = sync พังแต่ OAuth ยังใช้ได้ (ดู lastErrorCode)
      lastSuccessAt: connection.last_success_at ?? null, lastErrorCode: connection.last_error_code ?? null, connectionError: null,
    };
  }
  for (const error of result.errors ?? []) {
    if (meta[error.brandId]) meta[error.brandId] = { ...meta[error.brandId], connectionError: error.code };
  }
  return { ...config, mappings: { ...(config.mappings ?? {}), meta } };
}

/** ดึงข้อมูลทีละบัญชี (Edge Function รันครั้งละบัญชี · กันชน rate limit ของ Meta) — บัญชีที่พังไม่หยุดคิว */
export async function runSyncQueue(connectionIds, sync, onProgress = () => {}) {
  const results = [];
  for (const connectionId of connectionIds) {
    try {
      const data = await sync(connectionId);
      results.push({ connectionId, ok: true, rowsWritten: Number(data?.rowsWritten) || 0, mode: data?.mode ?? null, code: null });
    } catch (error) {
      results.push({ connectionId, ok: false, rowsWritten: 0, mode: null, code: error?.code ?? error?.message ?? "SYNC_FAILED" });
    }
    onProgress(results.length, connectionIds.length);
  }
  return results;
}

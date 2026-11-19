/**
 * WaveCraft Cloud Sync Relay
 * Facilitates zero-config, end-to-end device-to-device library sync (PC <-> Mobile)
 * using temporary in-memory sync rooms with a 30-minute time-to-live.
 */

const syncStore = new Map();
const SYNC_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB ceiling

function pruneExpiredSyncs() {
  const now = Date.now();
  for (const [code, entry] of syncStore.entries()) {
    if (now > entry.expiresAt) {
      syncStore.delete(code);
    }
  }
}

export function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WAVE-${rand}`;
}

export function publishSyncPayload(code, payload) {
  pruneExpiredSyncs();

  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid library payload' };
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    return { success: false, error: 'Library payload exceeds 5MB limit' };
  }

  const finalCode = (code || generateSyncCode()).trim().toUpperCase();
  const expiresAt = Date.now() + SYNC_TTL_MS;

  syncStore.set(finalCode, {
    payload,
    createdAt: Date.now(),
    expiresAt
  });

  return {
    success: true,
    code: finalCode,
    expiresAt,
    expiresInMinutes: 30
  };
}

export function pullSyncPayload(code) {
  pruneExpiredSyncs();

  if (!code || typeof code !== 'string') {
    return { success: false, error: 'Sync code is required' };
  }

  const cleanCode = code.trim().toUpperCase();
  const entry = syncStore.get(cleanCode);

  if (!entry) {
    return { success: false, error: 'Sync code expired, invalid, or already consumed.' };
  }

  if (Date.now() > entry.expiresAt) {
    syncStore.delete(cleanCode);
    return { success: false, error: 'Sync code has expired.' };
  }

  return {
    success: true,
    code: cleanCode,
    payload: entry.payload,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt
  };
}

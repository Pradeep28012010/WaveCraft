/**
 * WaveCraft Cloud Sync Relay
 * Facilitates zero-config, end-to-end device-to-device library sync (PC <-> Mobile)
 * using temporary in-memory sync rooms with a 30-minute time-to-live.
 */

import { randomInt } from 'node:crypto';

const syncStore = new Map();
const SYNC_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB ceiling
const MAX_SYNC_ENTRIES = 500;

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
    rand += chars.charAt(randomInt(0, chars.length));
  }
  return `WAVE-${rand}`;
}

export function publishSyncPayload(code, payload) {
  pruneExpiredSyncs();

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { success: false, error: 'Invalid library payload' };
  }

  let serialized = '';
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { success: false, error: 'Invalid library payload' };
  }

  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    return { success: false, error: 'Library payload exceeds 5MB limit' };
  }

  const rawCode = typeof code === 'string' && code.trim() ? code.trim().toUpperCase() : generateSyncCode();
  const finalCode = rawCode.replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  if (finalCode.length < 4) {
    return { success: false, error: 'Invalid sync code format' };
  }

  while (syncStore.size >= MAX_SYNC_ENTRIES && !syncStore.has(finalCode)) {
    const oldestKey = syncStore.keys().next().value;
    if (!oldestKey) break;
    syncStore.delete(oldestKey);
  }

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

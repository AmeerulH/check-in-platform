"use client";

import { openDB } from "idb";

export type PendingScan = {
  attempts?: number;
  capturedAt: string;
  clientScanId: string;
  deviceLabel: string;
  failed?: boolean;
  lastError?: string;
  payload: string;
};

const DATABASE_NAME = "gtp-check-in";
const STORE_NAME = "pending-scans";

async function database() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "clientScanId" });
      }
    },
  });
}

export async function addPendingScan(scan: PendingScan) {
  const db = await database();
  const existing = await db.get(STORE_NAME, scan.clientScanId) as PendingScan | undefined;
  await db.put(STORE_NAME, {
    ...existing,
    ...scan,
    attempts: scan.attempts ?? (existing?.attempts ?? 0) + 1,
    failed: scan.failed ?? existing?.failed ?? false,
    lastError: scan.lastError ?? existing?.lastError,
  });
}

export async function updatePendingScan(clientScanId: string, patch: Partial<PendingScan>) {
  const db = await database();
  const existing = await db.get(STORE_NAME, clientScanId) as PendingScan | undefined;
  if (!existing) return;
  await db.put(STORE_NAME, { ...existing, ...patch, clientScanId });
}

export async function getPendingScans() {
  const db = await database();
  return db.getAll(STORE_NAME) as Promise<PendingScan[]>;
}

export async function removePendingScan(clientScanId: string) {
  const db = await database();
  await db.delete(STORE_NAME, clientScanId);
}

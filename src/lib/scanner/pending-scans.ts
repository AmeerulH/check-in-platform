"use client";

import { openDB } from "idb";

export type PendingScan = {
  capturedAt: string;
  clientScanId: string;
  deviceLabel: string;
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
  await db.put(STORE_NAME, scan);
}

export async function getPendingScans() {
  const db = await database();
  return db.getAll(STORE_NAME) as Promise<PendingScan[]>;
}

export async function removePendingScan(clientScanId: string) {
  const db = await database();
  await db.delete(STORE_NAME, clientScanId);
}

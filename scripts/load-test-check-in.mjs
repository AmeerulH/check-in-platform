import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const EVENT_ID = "3ca63df5-0a3a-452f-a38d-151020260001";
const SCANNER_EMAIL = "loadtest-scanner@example.test";
const GUEST_COUNT = 400;
const REPEAT_COUNT = 80;
const BURST_COUNT = 100;
const SCAN_CONCURRENCY = 9;
const BURST_CONCURRENCY = 50;
const P95_LIMIT_MS = 1_000;

const cleanupOnly = process.argv.includes("--cleanup");
const dbOnly = process.argv.includes("--db-only");

function loadEnvFile(file, override) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value.replaceAll("\\n", "\n");
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

function digestToken(token, pepper) {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

function percentile(sorted, percent) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(label, samples, elapsedMs) {
  const latencies = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const failures = samples.filter((sample) => sample.status >= 500 || sample.status === 0);
  const elapsedSeconds = elapsedMs / 1000;
  const report = {
    label,
    requests: samples.length,
    failures: failures.length,
    requestsPerSecond: Number((samples.length / elapsedSeconds).toFixed(2)),
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
  };
  console.log(
    `${label}: ${report.requests} requests, ${report.failures} failed, ${report.requestsPerSecond} req/s, p50 ${report.p50} ms, p95 ${report.p95} ms, p99 ${report.p99} ms`,
  );
  if (failures.length) {
    console.log(`  first failure: ${failures[0].detail ?? failures[0].status}`);
  }
  return report;
}

async function runPool(items, concurrency, worker) {
  const samples = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const current = next;
      next += 1;
      const started = performance.now();
      try {
        const result = await worker(items[current], current);
        samples[current] = { ...result, ms: performance.now() - started };
      } catch (error) {
        samples[current] = {
          status: 0,
          ms: performance.now() - started,
          detail: error instanceof Error ? error.message : "Request failed",
        };
      }
    }
  }
  const started = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return { samples, elapsedMs: performance.now() - started };
}

async function deleteLoadTestGuests(admin) {
  const { data: guests, error } = await admin
    .from("guests")
    .select("id")
    .eq("event_id", EVENT_ID)
    .like("normalized_email", "loadtest+%@example.test");
  if (error) throw new Error(error.message);
  const ids = (guests ?? []).map((guest) => guest.id);
  if (!ids.length) return 0;

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { error: scanError } = await admin.from("scan_events").delete().in("guest_id", chunk);
    if (scanError) throw new Error(scanError.message);
    const { error: guestError } = await admin.from("guests").delete().in("id", chunk);
    if (guestError) throw new Error(guestError.message);
  }
  return ids.length;
}

async function ensureScanner(admin, password) {
  const created = await admin.auth.admin.createUser({
    email: SCANNER_EMAIL,
    password,
    email_confirm: true,
  });
  let userId = created.data.user?.id ?? null;
  if (!userId) {
    let page = 1;
    while (!userId && page < 20) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = listed.data.users.find((user) => user.email === SCANNER_EMAIL)?.id ?? null;
      if (userId || listed.data.users.length < 200) break;
      page += 1;
    }
    if (!userId) throw new Error(created.error?.message ?? "Could not create the load-test scanner.");
    const updated = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (updated.error) throw new Error(updated.error.message);
  }

  const { error } = await admin.from("event_memberships").upsert({
    event_id: EVENT_ID,
    auth_user_id: userId,
    normalized_email: SCANNER_EMAIL,
    role: "scanner",
    active: true,
  }, { onConflict: "event_id,normalized_email" });
  if (error) throw new Error(error.message);

  const { data: membership, error: membershipError } = await admin
    .from("event_memberships")
    .select("id")
    .eq("event_id", EVENT_ID)
    .eq("normalized_email", SCANNER_EMAIL)
    .single();
  if (membershipError || !membership) throw new Error(membershipError?.message ?? "Scanner membership is missing.");
  return { userId, membershipId: membership.id };
}

async function seedGuests(admin, pepper) {
  const removed = await deleteLoadTestGuests(admin);
  if (removed) console.log(`Removed ${removed} previous load-test guests.`);

  const guestRows = Array.from({ length: GUEST_COUNT }, (_, index) => ({
    event_id: EVENT_ID,
    display_name: `Load Test Guest ${index + 1}`,
    normalized_email: `loadtest+${index + 1}@example.test`,
    organization: "Load test",
    status: "active",
  }));
  const inserted = [];
  for (let index = 0; index < guestRows.length; index += 100) {
    const { data, error } = await admin
      .from("guests")
      .insert(guestRows.slice(index, index + 100))
      .select("id, normalized_email");
    if (error) throw new Error(error.message);
    inserted.push(...(data ?? []));
  }

  const passes = inserted.map((guest) => {
    const token = `v1.${randomBytes(32).toString("base64url")}`;
    return {
      guestId: guest.id,
      email: guest.normalized_email,
      publicId: randomUUID(),
      token,
      digest: digestToken(token, pepper),
    };
  });
  for (let index = 0; index < passes.length; index += 100) {
    const { error } = await admin.from("guest_credentials").insert(passes.slice(index, index + 100).map((pass) => ({
      guest_id: pass.guestId,
      public_id: pass.publicId,
      token_digest: pass.digest,
      version: 1,
    })));
    if (error) throw new Error(error.message);
  }
  return passes;
}

function buildScans(passes) {
  const first = passes.map((pass, index) => ({
    pass,
    clientScanId: randomUUID(),
    deviceLabel: `Load test scanner ${(index % SCAN_CONCURRENCY) + 1}`,
  }));
  const repeats = passes.slice(0, REPEAT_COUNT).map((pass, index) => ({
    pass,
    clientScanId: randomUUID(),
    deviceLabel: `Load test scanner ${(index % SCAN_CONCURRENCY) + 1}`,
  }));
  const burst = passes.slice(0, BURST_COUNT).map((pass) => ({
    pass,
    clientScanId: randomUUID(),
    deviceLabel: "Load test burst",
  }));
  return { steady: [...first, ...repeats], burst };
}

async function recordDirect(admin, scanner, scan) {
  const { data, error } = await admin.rpc("record_check_in", {
    p_event_id: EVENT_ID,
    p_membership_id: scanner.membershipId,
    p_auth_user_id: scanner.userId,
    p_device_label: scan.deviceLabel,
    p_public_id: scan.pass.publicId,
    p_token_digest: scan.pass.digest,
    p_client_scan_id: scan.clientScanId,
    p_captured_at: new Date().toISOString(),
    p_allow_outside_hours: true,
  }).single();
  if (error || !data) return { status: 500, detail: error?.message ?? "No check-in row returned" };
  return { status: 200, alreadyProcessed: data.out_already_processed };
}

async function signIn(supabaseUrl, publishableKey, password) {
  const jar = new Map();
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) jar.set(cookie.name, cookie.value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: SCANNER_EMAIL, password });
  if (error) throw new Error(error.message);
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function verifyCounts(admin, passes, expectedScans) {
  const ids = passes.map((pass) => pass.guestId);
  let rows = 0;
  let scanCount = 0;
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { count, error: countError } = await admin
      .from("daily_attendance")
      .select("id", { count: "exact", head: true })
      .in("guest_id", chunk);
    if (countError) throw new Error(countError.message);
    rows += count ?? 0;
    const { data, error } = await admin.from("daily_attendance").select("scan_count").in("guest_id", chunk);
    if (error) throw new Error(error.message);
    scanCount += (data ?? []).reduce((sum, row) => sum + row.scan_count, 0);
  }
  const ok = rows === GUEST_COUNT && scanCount === expectedScans;
  console.log(`Attendance rows ${rows} (expected ${GUEST_COUNT}), scan count ${scanCount} (expected ${expectedScans}) ${ok ? "ok" : "MISMATCH"}`);
  return ok;
}

async function clearAttendance(admin, passes) {
  const ids = passes.map((pass) => pass.guestId);
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { error } = await admin.from("scan_events").delete().in("guest_id", chunk);
    if (error) throw new Error(error.message);
    const { error: attendanceError } = await admin.from("daily_attendance").delete().in("guest_id", chunk);
    if (attendanceError) throw new Error(attendanceError.message);
  }
}

loadEnvFile(".env", false);
loadEnvFile(".env.local", true);

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const hostname = new URL(supabaseUrl).hostname;
if (hostname !== "localhost" && hostname !== "127.0.0.1") {
  console.error("Refusing to run: Supabase URL is not local.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (cleanupOnly) {
  const removed = await deleteLoadTestGuests(admin);
  console.log(`Removed ${removed} load-test guests.`);
  process.exit(0);
}

const password = randomBytes(18).toString("base64url");
const scanner = await ensureScanner(admin, password);
const passes = await seedGuests(admin, requireEnv("QR_TOKEN_PEPPER"));
console.log(`Seeded ${passes.length} guests.`);

const scans = buildScans(passes);
let failed = false;

const directSteady = await runPool(scans.steady, SCAN_CONCURRENCY, (scan) => recordDirect(admin, scanner, scan));
const directSteadyReport = summarize("Database, 9 at a time", directSteady.samples, directSteady.elapsedMs);
const directBurst = await runPool(scans.burst, BURST_CONCURRENCY, (scan) => recordDirect(admin, scanner, scan));
const directBurstReport = summarize("Database burst, 50 at a time", directBurst.samples, directBurst.elapsedMs);
const replay = await recordDirect(admin, scanner, scans.steady[0]);
if (replay.status !== 200 || !replay.alreadyProcessed) {
  console.log("Idempotent replay did not return the original scan.");
  failed = true;
}
const expectedDirect = scans.steady.length + scans.burst.length;
failed ||= directSteadyReport.failures > 0 || directBurstReport.failures > 0 || directSteadyReport.p95 > P95_LIMIT_MS;
failed ||= !(await verifyCounts(admin, passes, expectedDirect));

if (!dbOnly) {
  const appUrl = process.env.LOADTEST_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let reachable = false;
  try {
    const probe = await fetch(appUrl, { redirect: "manual" });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }

  if (!reachable) {
    console.log(`HTTP tier skipped: ${appUrl} is not running. Start it with next build && next start, then rerun.`);
    failed = true;
  } else {
    await clearAttendance(admin, passes);
    const cookie = await signIn(supabaseUrl, requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), password);
    const passOrigin = (process.env.NEXT_PUBLIC_APP_URL || appUrl).replace(/\/$/, "");
    const postScan = async (scan) => {
      const response = await fetch(new URL("/api/check-in", appUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({
          payload: `${passOrigin}/pass/${scan.pass.publicId}#${scan.pass.token}`,
          clientScanId: scan.clientScanId,
          deviceLabel: scan.deviceLabel,
          capturedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        return { status: response.status, detail: body.slice(0, 180) };
      }
      return { status: response.status };
    };
    const httpSteady = await runPool(scans.steady, SCAN_CONCURRENCY, postScan);
    const httpSteadyReport = summarize("HTTP, 9 at a time", httpSteady.samples, httpSteady.elapsedMs);
    const httpBurst = await runPool(scans.burst, BURST_CONCURRENCY, postScan);
    const httpBurstReport = summarize("HTTP burst, 50 at a time", httpBurst.samples, httpBurst.elapsedMs);
    failed ||= httpSteadyReport.failures > 0 || httpBurstReport.failures > 0 || httpSteadyReport.p95 > P95_LIMIT_MS;
    failed ||= !(await verifyCounts(admin, passes, expectedDirect));
  }
}

console.log(failed
  ? "Load test failed. Pass criteria: no server errors, exact attendance counts, and p95 under 1 second for the 9-scanner run."
  : "Load test passed.");
console.log("Load-test guests remain locally as loadtest+N@example.test. Run with --cleanup to remove them.");
process.exit(failed ? 1 : 0);

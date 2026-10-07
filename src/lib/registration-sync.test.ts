import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_REGISTRATION_SPREADSHEET_ID } from "@/lib/registration-sheet";
import { syncRegistrationSheet } from "@/lib/registration-sync";
import { SheetSyncError } from "@/lib/sheet-sync-error";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceAccountKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

type DbError = { code?: string; message: string } | null;

const adminMock = vi.hoisted(() => {
  const state = {
    guests: [] as Array<Record<string, unknown>>,
    imports: [] as Array<Record<string, unknown>>,
    guestInsertError: null as DbError,
    importInsertError: null as DbError,
  };

  function reset() {
    state.guests = [];
    state.imports = [];
    state.guestInsertError = null;
    state.importInsertError = null;
  }

  function handle(table: string, op: string, payload: unknown) {
    if (table === "guests" && op === "select") return { data: state.guests, error: null };
    if (table === "guests" && op === "insert") {
      if (state.guestInsertError) return { data: null, error: state.guestInsertError };
      const row = { id: `guest-${state.guests.length + 1}`, ...(payload as Record<string, unknown>) };
      state.guests.push(row);
      return { data: { id: row.id }, error: null };
    }
    if (table === "imports" && op === "insert") {
      const record = payload as { status?: string };
      if (record.status === "previewed" && state.importInsertError) return { data: null, error: state.importInsertError };
      const row = { id: `import-${state.imports.length + 1}`, ...(payload as Record<string, unknown>) };
      state.imports.push(row);
      return { data: { id: row.id }, error: null };
    }
    if (table === "imports" && op === "update") {
      const values = payload as { status?: string };
      const current = [...state.imports].reverse().find((row) => row.status === "previewed") ?? state.imports.at(-1);
      if (current && values.status) Object.assign(current, payload);
      return { data: null, error: null };
    }
    if (table === "guest_source_changes") return { data: [], error: null };
    return { data: null, error: null };
  }

  function builder(table: string, op: string, payload?: unknown) {
    const finish = () => handle(table, op, payload);
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      lt() { return chain; },
      neq() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      is() { return chain; },
      update(next: unknown) { return builder(table, "update", next); },
      insert(next: unknown) { return builder(table, "insert", next); },
      upsert(next: unknown) { return builder(table, "upsert", next); },
      single() { return Promise.resolve(finish()); },
      maybeSingle() { return Promise.resolve(finish()); },
      then(onfulfilled?: (value: { data: unknown; error: DbError }) => unknown, onrejected?: (reason: unknown) => unknown) {
        return Promise.resolve(finish()).then(onfulfilled, onrejected);
      },
    };
    return chain;
  }

  return {
    state,
    reset,
    createClient() {
      return { from(table: string) { return builder(table, "select"); } };
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/pass-issuer", () => ({ ensureGuestPass: vi.fn(async () => "created" as const) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => adminMock.createClient() }));

const REG_HEADER = ["NAME", "ID", "EMAIL", "PHONE", "TICKETS", "", "", "", "TITLE", "ORG", "REGION", "COUNTRY"];
const WORKSHOP_HEADER = ["Timestamp", "Name", "Email address", "Session", "Seats"];

type SheetFixture = {
  sheets: Array<{ title: string; index: number; hidden?: boolean }>;
  headers?: Record<string, string[]>;
  values?: Record<string, string[][]>;
  tokenStatus?: number;
  tokenBody?: unknown;
  metadataStatus?: number;
  metadataBody?: unknown;
  valuesStatus?: number;
  valuesBody?: unknown;
  throwOn?: "metadata" | "values";
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body ?? {}), { status, headers: { "Content-Type": "application/json" } });
}

function titleFromRange(range: string) {
  if (!range.startsWith("'")) return range.split("!")[0];
  let title = "";
  for (let index = 1; index < range.length; index += 1) {
    if (range[index] === "'") {
      if (range[index + 1] === "'") { title += "'"; index += 1; continue; }
      return title;
    }
    title += range[index];
  }
  return title;
}

function installGoogle(fixture: SheetFixture) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("oauth2.googleapis.com/token")) return jsonResponse(fixture.tokenStatus ?? 200, fixture.tokenBody ?? { access_token: "test-token" });
    if (url.includes("/values:batchGet")) {
      const ranges = new URL(url).searchParams.getAll("ranges");
      return jsonResponse(200, {
        valueRanges: ranges.map((range) => {
          const header = fixture.headers?.[titleFromRange(range)] ?? [];
          return { range, values: header.length ? [header] : [] };
        }),
      });
    }
    if (url.includes("/values/")) {
      if (fixture.throwOn === "values") throw new Error("socket hang up");
      if (fixture.valuesStatus) return jsonResponse(fixture.valuesStatus, fixture.valuesBody);
      const range = decodeURIComponent(url.split("/values/")[1]?.split("?")[0] ?? "");
      const title = titleFromRange(range);
      const header = fixture.headers?.[title] ?? REG_HEADER;
      return jsonResponse(200, { values: [header, ...(fixture.values?.[title] ?? [])] });
    }
    if (url.includes("sheets.googleapis.com")) {
      if (fixture.throwOn === "metadata") throw new Error("socket hang up");
      if (fixture.metadataStatus) return jsonResponse(fixture.metadataStatus, fixture.metadataBody);
      return jsonResponse(200, {
        sheets: fixture.sheets.map((sheet) => ({ properties: { title: sheet.title, index: sheet.index, hidden: Boolean(sheet.hidden) } })),
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  }));
  return calls;
}

function registrationSheet(rows: string[][] = [guestRow()]) {
  return {
    sheets: [
      { title: "Sheet1", index: 0, hidden: true },
      { title: "Action Workshop Form responses", index: 1 },
      { title: "Registration List", index: 2 },
    ],
    headers: {
      Sheet1: REG_HEADER,
      "Action Workshop Form responses": WORKSHOP_HEADER,
      "Registration List": REG_HEADER,
    },
    values: { "Registration List": rows },
  } satisfies SheetFixture;
}

function guestRow(name = "Ada Lovelace", email = "ada@example.com", extra: string[] = []) {
  return [name, "R-1", email, "", "Delegate", "", "", "", "Dr", "Analytical", "Central", "Malaysia", ...extra];
}

async function syncFailure() {
  try {
    await syncRegistrationSheet("actor-1");
  } catch (error) {
    return error;
  }
  throw new Error("Expected sheet sync to fail.");
}

function expectFailedRun(error: unknown) {
  expect(error).toBeInstanceOf(SheetSyncError);
  expect(adminMock.state.imports).toEqual([
    expect.objectContaining({ status: "failed", summary: { error: (error as SheetSyncError).message } }),
  ]);
  expect(adminMock.state.imports.some((row) => row.status === "previewed")).toBe(false);
}

beforeEach(() => {
  adminMock.reset();
  process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = "sheets@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SHEETS_PRIVATE_KEY = serviceAccountKey;
  delete process.env.GOOGLE_SHEETS_TAB;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("registration sheet sync", () => {
  it("reads a renamed registration tab by its header row", async () => {
    const calls = installGoogle(registrationSheet());
    const summary = await syncRegistrationSheet("actor-1");
    const range = encodeURIComponent("'Registration List'!A:L");
    expect(summary).toMatchObject({ tab: "Registration List", created: 1, sourceRows: 1, invalidRows: [], duplicateRows: [] });
    expect(calls.some((url) => url.includes(`/spreadsheets/${DEFAULT_REGISTRATION_SPREADSHEET_ID}/values/${range}`))).toBe(true);
    expect(calls.some((url) => url.includes("Sheet1") || url.includes("A1:L1000") || url.includes("A1%3AL1000"))).toBe(false);
    expect(adminMock.state.guests[0]).toMatchObject({ display_name: "Ada Lovelace", normalized_email: "ada@example.com" });
  });

  it("skips blank rows and reports short rows", async () => {
    installGoogle(registrationSheet([["", "  ", ""], ["Only Name"]]));
    const summary = await syncRegistrationSheet("actor-1");
    expect(summary).toMatchObject({ sourceRows: 1, created: 0, invalidRows: [3], duplicateRows: [] });
    expect(adminMock.state.guests).toHaveLength(0);
  });

  it("imports rows that continue past column L", async () => {
    installGoogle(registrationSheet([guestRow("Extra Person", "extra@example.com", ["IGNORE", "IGNORE-2"])]));
    const summary = await syncRegistrationSheet("actor-1");
    expect(summary.created).toBe(1);
    expect(adminMock.state.guests[0]).toMatchObject({ display_name: "Extra Person", organization: "Analytical", country: "Malaysia" });
    expect(JSON.stringify(adminMock.state.guests[0])).not.toContain("IGNORE");
  });

  it("reports duplicate emails", async () => {
    installGoogle(registrationSheet([guestRow("Ada Lovelace", "Ada@Example.com"), guestRow("Ada Again", "ada@example.com")]));
    const summary = await syncRegistrationSheet("actor-1");
    expect(summary).toMatchObject({ sourceRows: 2, created: 1, duplicateRows: [3] });
    expect(adminMock.state.guests).toHaveLength(1);
  });

  it("quotes tab names and honors the spreadsheet override", async () => {
    process.env.GOOGLE_SHEETS_TAB = "O'Brien's List";
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-override-id";
    const calls = installGoogle({
      sheets: [{ title: "O'Brien's List", index: 0 }],
      headers: { "O'Brien's List": REG_HEADER },
      values: { "O'Brien's List": [guestRow(`Ada "Queen" Lovelace`, "queen@example.com")] },
    });
    const summary = await syncRegistrationSheet("actor-1");
    expect(summary.tab).toBe("O'Brien's List");
    expect(calls.some((url) => url.includes(`/spreadsheets/sheet-override-id/values/${encodeURIComponent("'O''Brien''s List'!A:L")}`))).toBe(true);
    expect(calls.some((url) => url.includes("values:batchGet"))).toBe(false);
    expect(adminMock.state.guests[0]).toMatchObject({ display_name: `Ada "Queen" Lovelace` });
  });

  it("reports missing credentials and stores a failed run", async () => {
    delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const calls = installGoogle(registrationSheet());
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (missing credentials): Google Sheets service account is not configured.");
    expect(calls).toHaveLength(0);
    expectFailedRun(error);
  });

  it("reports Google sign-in failures with Google's message", async () => {
    installGoogle({ ...registrationSheet(), tokenStatus: 400, tokenBody: { error: "invalid_grant", error_description: "Invalid JWT Signature." } });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (Google sign-in): Invalid JWT Signature.");
    expectFailedRun(error);
  });

  it("reports a missing Sheet", async () => {
    installGoogle({
      ...registrationSheet(),
      metadataStatus: 404,
      metadataBody: { error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } },
    });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (Sheet not found): Requested entity was not found.");
    expectFailedRun(error);
  });

  it("reports a Sheet that is not shared", async () => {
    installGoogle({
      ...registrationSheet(),
      metadataStatus: 403,
      metadataBody: { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } },
    });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (Sheet not shared): The caller does not have permission");
    expectFailedRun(error);
  });

  it("reports a missing registration tab", async () => {
    installGoogle({
      sheets: [{ title: "Action Workshop Form responses", index: 0 }],
      headers: { "Action Workshop Form responses": WORKSHOP_HEADER },
    });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (tab not found): No visible tab has NAME, EMAIL and TICKETS in columns A, C and E. Visible tabs: Action Workshop Form responses.");
    expectFailedRun(error);
  });

  it("reports a range Google cannot parse", async () => {
    installGoogle({
      ...registrationSheet(),
      valuesStatus: 400,
      valuesBody: { error: { code: 400, message: "Unable to parse range: 'Registration List'!A:L", status: "INVALID_ARGUMENT" } },
    });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (bad range): Unable to parse range: 'Registration List'!A:L");
    expectFailedRun(error);
  });

  it("reports registration columns that changed", async () => {
    process.env.GOOGLE_SHEETS_TAB = "Registration List";
    installGoogle({
      ...registrationSheet(),
      headers: { "Registration List": ["Full name", "ID", "Mail", "Phone", "Qty"] },
    });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe('Sheet sync failed (columns changed): Expected NAME, EMAIL and TICKETS in columns A, C and E of "Registration List". Found A="Full name", C="Mail", E="Qty".');
    expectFailedRun(error);
  });

  it("reports a sync that is already running", async () => {
    installGoogle(registrationSheet());
    adminMock.state.importInsertError = { code: "23505", message: 'duplicate key value violates unique constraint "imports_one_sheet_sync_in_progress"' };
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe('Sheet sync failed (sync already running): duplicate key value violates unique constraint "imports_one_sheet_sync_in_progress"');
    expectFailedRun(error);
  });

  it("reports a database write failure with the Sheet row", async () => {
    installGoogle(registrationSheet());
    adminMock.state.guestInsertError = { message: 'null value in column "display_name" violates not-null constraint' };
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe('Sheet sync failed (database write) at Sheet row 2: null value in column "display_name" violates not-null constraint');
    expect((error as SheetSyncError).recorded).toBe(true);
    expect(adminMock.state.imports[0]).toMatchObject({ status: "failed", summary: expect.objectContaining({ error: (error as SheetSyncError).message }) });
  });

  it("reports an unexpected failure", async () => {
    installGoogle({ ...registrationSheet(), throwOn: "metadata" });
    const error = await syncFailure();
    expect((error as SheetSyncError).message).toBe("Sheet sync failed (unexpected): socket hang up");
    expectFailedRun(error);
  });
});

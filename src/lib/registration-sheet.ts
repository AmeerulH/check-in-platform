import "server-only";

import { createSign } from "node:crypto";

import { errorDetail, SheetSyncError, type SheetSyncStep } from "@/lib/sheet-sync-error";

export const DEFAULT_REGISTRATION_SPREADSHEET_ID = "1rODaRXtINy-KengI3jlRbqAkeGsjwmghkcJp3mJDFbo";

type SheetTab = { title: string; index: number; hidden: boolean };
type GoogleFailure = { step: SheetSyncStep; detail: string; payload: unknown };

function spreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || DEFAULT_REGISTRATION_SPREADSHEET_ID;
}

function sheetRange(title: string, cells: string) {
  return `'${title.replaceAll("'", "''")}'!${cells}`;
}

function headerText(row: unknown[] | undefined, index: number) {
  const value = row?.[index];
  return value == null ? "" : String(value).trim().toLowerCase();
}

function headersMatch(row: unknown[] | undefined) {
  return headerText(row, 0) === "name" && headerText(row, 2) === "email" && headerText(row, 4) === "tickets";
}

function describeHeader(row: unknown[] | undefined) {
  const shown = (index: number) => {
    const value = row?.[index];
    return value == null ? "" : String(value);
  };
  return `A="${shown(0)}", C="${shown(2)}", E="${shown(4)}"`;
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function googleDetail(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as { error?: unknown; error_description?: unknown };
    if (typeof record.error_description === "string" && record.error_description.trim()) return record.error_description;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
    if (record.error && typeof record.error === "object" && "message" in record.error && typeof record.error.message === "string" && record.error.message.trim()) {
      return record.error.message;
    }
  }
  return `Google request failed with HTTP ${status}.`;
}

function classifySheetsFailure(status: number, detail: string, payload: unknown): SheetSyncStep {
  const reason = payload && typeof payload === "object" && payload !== null && "error" in payload && payload.error && typeof payload.error === "object" && "status" in payload.error
    ? String(payload.error.status)
    : "";
  if (status === 401) return "Google sign-in";
  if (status === 403 || reason === "PERMISSION_DENIED") return "Sheet not shared";
  if (status === 404 || reason === "NOT_FOUND") return "Sheet not found";
  if ((status === 400 || reason === "INVALID_ARGUMENT") && /unable to parse range/i.test(detail)) return "bad range";
  return "unexpected";
}

async function googleFailure(response: Response): Promise<GoogleFailure> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const detail = googleDetail(payload, response.status);
  return { step: classifySheetsFailure(response.status, detail, payload), detail, payload };
}

async function googleJson(url: string | URL, token: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (error) {
    throw new SheetSyncError("unexpected", errorDetail(error), { cause: error });
  }
  if (!response.ok) {
    const failure = await googleFailure(response);
    throw new SheetSyncError(failure.step, failure.detail, { cause: failure.payload });
  }
  try {
    return await response.json() as unknown;
  } catch (error) {
    throw new SheetSyncError("unexpected", errorDetail(error), { cause: error });
  }
}

async function accessToken() {
  const email = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key?.trim()) {
    throw new SheetSyncError("missing credentials", "Google Sheets service account is not configured.");
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  let assertion: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    assertion = `${unsigned}.${signer.sign(key).toString("base64url")}`;
  } catch (error) {
    throw new SheetSyncError("Google sign-in", errorDetail(error), { cause: error });
  }
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      cache: "no-store",
    });
  } catch (error) {
    throw new SheetSyncError("unexpected", errorDetail(error), { cause: error });
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new SheetSyncError("Google sign-in", googleDetail(payload, response.status), { cause: payload });
  const token = payload && typeof payload === "object" && "access_token" in payload ? payload.access_token : undefined;
  if (typeof token !== "string" || !token) throw new SheetSyncError("Google sign-in", "Google Sheets authorization returned no token.", { cause: payload });
  return token;
}

async function listTabs(token: string, id: string) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=${encodeURIComponent("sheets.properties(title,index,hidden)")}`;
  const payload = await googleJson(url, token) as {
    sheets?: Array<{ properties?: { title?: string; index?: number; hidden?: boolean } }>;
  };
  return (payload.sheets ?? []).flatMap((sheet): SheetTab[] => {
    const title = sheet.properties?.title;
    if (!title) return [];
    return [{ title, index: sheet.properties?.index ?? 0, hidden: sheet.properties?.hidden === true }];
  });
}

async function chosenTab(token: string, id: string, sheets: SheetTab[]) {
  const override = process.env.GOOGLE_SHEETS_TAB?.trim();
  if (override) {
    if (!sheets.some((sheet) => sheet.title === override)) {
      const titles = sheets.map((sheet) => sheet.title).join(", ") || "(none)";
      throw new SheetSyncError("tab not found", `Tab ${JSON.stringify(override)} was not found. Tabs: ${titles}.`);
    }
    return override;
  }
  const visible = sheets.filter((sheet) => !sheet.hidden).sort((left, right) => left.index - right.index);
  if (!visible.length) throw new SheetSyncError("tab not found", "The Sheet has no visible tabs.");
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet`);
  for (const sheet of visible) url.searchParams.append("ranges", sheetRange(sheet.title, "A1:E1"));
  url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
  const payload = await googleJson(url, token) as { valueRanges?: Array<{ values?: unknown[][] }> };
  const ranges = payload.valueRanges ?? [];
  for (let index = 0; index < visible.length; index += 1) {
    if (headersMatch(ranges[index]?.values?.[0])) return visible[index].title;
  }
  throw new SheetSyncError("tab not found", `No visible tab has NAME, EMAIL and TICKETS in columns A, C and E. Visible tabs: ${visible.map((sheet) => sheet.title).join(", ")}.`);
}

export async function readRegistrationSheet() {
  const token = await accessToken();
  const id = spreadsheetId();
  const title = await chosenTab(token, id, await listTabs(token, id));
  const range = sheetRange(title, "A:L");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const payload = await googleJson(url, token) as { values?: unknown[][] };
  const [header, ...body] = payload.values ?? [];
  if (!headersMatch(header)) {
    throw new SheetSyncError("columns changed", `Expected NAME, EMAIL and TICKETS in columns A, C and E of ${JSON.stringify(title)}. Found ${describeHeader(header)}.`);
  }
  return {
    tab: title,
    rows: body.map((cells, index) => ({
      cells: cells.slice(0, 12).map((value) => value == null ? "" : String(value)),
      sheetRow: index + 2,
    })).filter(({ cells }) => cells.some((value) => value.trim())),
  };
}

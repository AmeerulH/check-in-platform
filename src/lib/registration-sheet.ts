import "server-only";

import { createSign } from "node:crypto";

const SHEET_ID = "1rODaRXtINy-KengI3jlRbqAkeGsjwmghkcJp3mJDFbo";
const RANGE = "Sheet1!A1:L1000";

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const email = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google Sheets service account is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(key).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google Sheets authorization failed.");
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("Google Sheets authorization returned no token.");
  return result.access_token;
}

export async function readRegistrationSheet() {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?valueRenderOption=FORMATTED_VALUE`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Registration Sheet could not be read.");
  const result = await response.json() as { values?: string[][] };
  const [header, ...rows] = result.values ?? [];
  if (!header || header[0] !== "NAME" || header[2] !== "EMAIL" || header[4] !== "TICKETS") {
    throw new Error("Registration Sheet columns changed; sync stopped before making changes.");
  }
  return rows.map((cells, index) => ({ cells, sheetRow: index + 2 }))
    .filter(({ cells }) => cells.some((value) => value?.trim()));
}

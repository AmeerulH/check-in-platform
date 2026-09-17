import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import QRCode from "qrcode";

import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

export function createCredentialToken() {
  return `v1.${randomBytes(32).toString("base64url")}`;
}

export function digestCredentialToken(token: string) {
  return createHmac("sha256", getServerEnv().QR_TOKEN_PEPPER)
    .update(token)
    .digest("hex");
}

export function createPassUrl(publicId: string, token: string) {
  return `${getPublicEnv().NEXT_PUBLIC_APP_URL}/pass/${publicId}#${token}`;
}

const qrOptions = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  width: 600,
  color: {
    dark: "#10231d",
    light: "#ffffff",
  },
};

export function createPassQrDataUrl(passUrl: string) {
  return QRCode.toDataURL(passUrl, qrOptions);
}

export function createPassQrPng(passUrl: string) {
  return QRCode.toBuffer(passUrl, qrOptions);
}

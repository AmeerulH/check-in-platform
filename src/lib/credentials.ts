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

export function createPassQrDataUrl(passUrl: string) {
  return QRCode.toDataURL(passUrl, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 600,
    color: {
      dark: "#10231d",
      light: "#ffffff",
    },
  });
}

import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  QR_TOKEN_PEPPER: z.string().min(32),
  GTP_EVENT_TIMEZONE: z.literal("Asia/Kuala_Lumpur"),
  BOOTSTRAP_ADMIN_EMAIL: z.email().optional(),
  CHECK_IN_TEST_MODE: z.enum(["true", "false"]).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    QR_TOKEN_PEPPER: process.env.QR_TOKEN_PEPPER,
    GTP_EVENT_TIMEZONE: process.env.GTP_EVENT_TIMEZONE,
    BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL || undefined,
    CHECK_IN_TEST_MODE: process.env.CHECK_IN_TEST_MODE || undefined,
  });
}

export function isCheckInTestMode() {
  return process.env.CHECK_IN_TEST_MODE !== "false";
}

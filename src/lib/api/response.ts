import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "AUTH_ACCESS_DENIED"
  | "AUTH_INVALID_EMAIL"
  | "AUTH_LINK_RATE_LIMITED"
  | "AUTH_DELIVERY_UNAVAILABLE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "GUEST_DUPLICATE_EMAIL"
  | "GUEST_NOT_FOUND"
  | "GUEST_INVALID_INPUT"
  | "CREDENTIAL_ISSUE_FAILED"
  | "PASS_INVALID_OR_REVOKED";

type ApiErrorOptions = {
  code: ApiErrorCode;
  message: string;
  retryAfterSeconds?: number;
  status: 400 | 403 | 404 | 409 | 429 | 503;
};

export function apiError({
  code,
  message,
  retryAfterSeconds,
  status,
}: ApiErrorOptions) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        retryable: status !== 400,
        retryAfterSeconds,
      },
    },
    {
      status,
      headers: retryAfterSeconds
        ? { "Retry-After": String(retryAfterSeconds) }
        : undefined,
    },
  );
}

export function apiSuccess<T extends Record<string, unknown>>(data: T) {
  return NextResponse.json(data);
}

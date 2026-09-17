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
  | "GUEST_DELETE_HAS_ATTENDANCE"
  | "GUEST_DELETE_FAILED"
  | "CREDENTIAL_ISSUE_FAILED"
  | "CREDENTIAL_FILE_STORE_FAILED"
  | "PASS_INVALID_OR_REVOKED"
  | "PASS_FILE_UNAVAILABLE"
  | "SCAN_INVALID_INPUT"
  | "SCAN_EVENT_NOT_ACTIVE"
  | "SCAN_RECORD_FAILED"
  | "ATTENDANCE_INVALID_FILTER"
  | "ATTENDANCE_UNAVAILABLE"
  | "STAFF_INVALID_INPUT"
  | "STAFF_ALREADY_EXISTS"
  | "STAFF_SERVICE_UNAVAILABLE"
  | "STAFF_NOT_FOUND"
  | "STAFF_SELF_ROLE_PROTECTED"
  | "STAFF_LAST_ORGANIZER_PROTECTED";

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
        retryable: status === 429 || status === 503,
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

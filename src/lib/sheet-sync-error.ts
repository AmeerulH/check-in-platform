export type SheetSyncStep =
  | "missing credentials"
  | "Google sign-in"
  | "Sheet not found"
  | "Sheet not shared"
  | "tab not found"
  | "bad range"
  | "columns changed"
  | "sync already running"
  | "database write"
  | "unexpected";

export class SheetSyncError extends Error {
  readonly step: SheetSyncStep;
  readonly sheetRow?: number;
  recorded = false;

  constructor(step: SheetSyncStep, detail: string, options?: { cause?: unknown; sheetRow?: number }) {
    super(formatSheetSyncError(step, detail, options?.sheetRow), options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SheetSyncError";
    this.step = step;
    this.sheetRow = options?.sheetRow;
  }
}

export function formatSheetSyncError(step: SheetSyncStep, detail: string, sheetRow?: number) {
  const cleaned = detail.trim() || "No further detail was returned.";
  if (sheetRow !== undefined) return `Sheet sync failed (${step}) at Sheet row ${sheetRow}: ${cleaned}`;
  return `Sheet sync failed (${step}): ${cleaned}`;
}

export function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Unexpected sheet sync failure.";
}

export function asSheetSyncError(error: unknown, step: SheetSyncStep = "unexpected") {
  if (error instanceof SheetSyncError) return error;
  return new SheetSyncError(step, errorDetail(error), { cause: error });
}

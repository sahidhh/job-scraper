import type { JobSource } from "@/shared/domain/enums";

export class SourceAuthExpiredError extends Error {
  readonly source: JobSource;
  readonly statusCode?: number;
  readonly reason: string;

  constructor(source: JobSource, statusCode: number | undefined, reason: string) {
    super(`[${source}] Authentication expired${statusCode ? ` (${statusCode})` : ""}: ${reason}`);
    this.name = "SourceAuthExpiredError";
    this.source = source;
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

export class SourceBlockedError extends Error {
  readonly source: JobSource;
  readonly statusCode?: number;
  readonly reason: string;

  constructor(source: JobSource, statusCode: number | undefined, reason: string) {
    super(`[${source}] Source blocked${statusCode ? ` (${statusCode})` : ""}: ${reason}`);
    this.name = "SourceBlockedError";
    this.source = source;
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

// Thrown by domain validation functions across all features.
// Infrastructure/presentation layers catch this to surface field-level
// errors (e.g. as server action results) without leaking domain internals.
export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

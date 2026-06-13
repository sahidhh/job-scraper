import { SOURCES_REQUIRING_BOARD_TOKEN } from "@/shared/domain/enums";
import { DomainValidationError } from "@/shared/domain/errors";
import { assertNonEmpty } from "@/shared/domain/validation";
import type { NewCompany } from "./types";

// Board tokens are URL slugs, e.g. "stripe" in boards.greenhouse.io/stripe.
const BOARD_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function validateNewCompany(input: NewCompany): void {
  assertNonEmpty(input.name, "name");

  const requiresToken = SOURCES_REQUIRING_BOARD_TOKEN.includes(input.source);

  if (requiresToken) {
    if (!input.boardToken || input.boardToken.trim().length === 0) {
      throw new DomainValidationError(
        `${input.source} companies require a non-empty boardToken`,
      );
    }
    if (!BOARD_TOKEN_PATTERN.test(input.boardToken)) {
      throw new DomainValidationError(
        `boardToken "${input.boardToken}" must be a lowercase slug (letters, digits, hyphens)`,
      );
    }
  } else if (input.boardToken !== null) {
    throw new DomainValidationError(
      `${input.source} companies must not set boardToken (feed-based source)`,
    );
  }
}

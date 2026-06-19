import type { SourceValidator } from "@/features/sources/domain/sourceValidation";
import { ashbyValidator } from "./AshbyValidator";
import { greenhouseValidator } from "./GreenhouseValidator";
import { leverValidator } from "./LeverValidator";

// All ATS board validators. Only sources that use per-company board_tokens
// (greenhouse, lever, ashby) have validators — feed-based sources
// (remoteok, wellfound, mycareersfuture) need no board-level health check.
export const sourceValidators: readonly SourceValidator[] = [
  greenhouseValidator,
  leverValidator,
  ashbyValidator,
];

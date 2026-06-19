import type { SourceValidator, ValidationResult } from "@/features/sources/domain/sourceValidation";
import { probeBoard } from "./probe";

function boardUrl(boardToken: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`;
}

export const greenhouseValidator: SourceValidator = {
  source: "greenhouse",
  validate(boardToken: string, companyName: string): Promise<ValidationResult> {
    return probeBoard(boardUrl(boardToken), boardToken, companyName);
  },
};

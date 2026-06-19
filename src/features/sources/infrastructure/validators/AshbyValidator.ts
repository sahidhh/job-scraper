import type { SourceValidator, ValidationResult } from "@/features/sources/domain/sourceValidation";
import { probeBoard } from "./probe";

function boardUrl(boardToken: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${boardToken}`;
}

export const ashbyValidator: SourceValidator = {
  source: "ashby",
  validate(boardToken: string, companyName: string): Promise<ValidationResult> {
    return probeBoard(boardUrl(boardToken), boardToken, companyName);
  },
};

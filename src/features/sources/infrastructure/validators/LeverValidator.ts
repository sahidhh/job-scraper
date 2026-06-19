import type { SourceValidator, ValidationResult } from "@/features/sources/domain/sourceValidation";
import { probeBoard } from "./probe";

function boardUrl(boardToken: string): string {
  return `https://api.lever.co/v0/postings/${boardToken}?mode=json`;
}

export const leverValidator: SourceValidator = {
  source: "lever",
  validate(boardToken: string, companyName: string): Promise<ValidationResult> {
    return probeBoard(boardUrl(boardToken), boardToken, companyName);
  },
};

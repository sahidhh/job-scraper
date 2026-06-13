import type { JobSource } from "@/shared/domain/enums";
import type { Company, CompanyUpdate, NewCompany } from "./types";

export interface CompanyRepository {
  /** Active companies, optionally narrowed to one source. Used by scrape.ts. */
  listActive(source?: JobSource): Promise<Company[]>;

  /** All companies, for /settings management. */
  list(): Promise<Company[]>;

  create(input: NewCompany): Promise<Company>;
  update(id: string, input: CompanyUpdate): Promise<Company>;
  remove(id: string): Promise<void>;
}

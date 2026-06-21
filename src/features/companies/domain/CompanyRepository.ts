import type { JobSource } from "@/shared/domain/enums";
import type { Company, CompanyUpdate, NewCompany, SourceHealthUpdate } from "./types";

export interface CompanyRepository {
  /** Active companies, optionally narrowed to one source. Used by scrape.ts. */
  listActive(source?: JobSource): Promise<Company[]>;

  /** Active companies excluding disabled health status. Used by scrape.ts to skip broken sources. */
  listActiveHealthy(source?: JobSource): Promise<Company[]>;

  /** All companies, for /settings management. */
  list(): Promise<Company[]>;

  create(input: NewCompany): Promise<Company>;
  update(id: string, input: CompanyUpdate): Promise<Company>;
  updateHealth(id: string, update: SourceHealthUpdate): Promise<void>;
  remove(id: string): Promise<void>;
}

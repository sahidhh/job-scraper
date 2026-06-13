import type { JobSource } from "@/shared/domain/enums";

// Mirrors the `companies` table (database.md §2).
export interface Company {
  id: string;
  name: string;
  source: JobSource;
  boardToken: string | null; // null for sources that don't use one (remoteok/wellfound)
  active: boolean;
  createdAt: string; // ISO 8601
}

export interface NewCompany {
  name: string;
  source: JobSource;
  boardToken: string | null;
  active?: boolean;
}

export type CompanyUpdate = Partial<NewCompany>;

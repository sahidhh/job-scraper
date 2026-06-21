import type { CompanyRepository } from "@/features/companies/domain/CompanyRepository";
import type { Company, CompanyUpdate, NewCompany, SourceHealthUpdate } from "@/features/companies/domain/types";
import type { JobSource } from "@/shared/domain/enums";
import type { TypedSupabaseClient } from "@/shared/infrastructure/supabaseClient";
import { toAppError } from "@/shared/infrastructure/supabaseError";
import type { Database } from "../../../../supabase/database.types";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CompanyUpdateRow = Database["public"]["Tables"]["companies"]["Update"];

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    boardToken: row.board_token,
    active: row.active,
    createdAt: row.created_at,
    healthStatus: row.health_status,
    consecutiveFailures: row.consecutive_failures,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
  };
}

// repositories.md §1.
export class SupabaseCompanyRepository implements CompanyRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listActive(source?: JobSource): Promise<Company[]> {
    let query = this.client.from("companies").select("*").eq("active", true);
    if (source) {
      query = query.eq("source", source);
    }

    const { data, error } = await query;
    if (error) throw toAppError(error);
    return (data ?? []).map(toCompany);
  }

  async listActiveHealthy(source?: JobSource): Promise<Company[]> {
    let query = this.client
      .from("companies")
      .select("*")
      .eq("active", true)
      .neq("health_status", "disabled");
    if (source) {
      query = query.eq("source", source);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(toCompany);
  }

  async list(): Promise<Company[]> {
    const { data, error } = await this.client.from("companies").select("*");
    if (error) throw toAppError(error);
    return (data ?? []).map(toCompany);
  }

  async create(input: NewCompany): Promise<Company> {
    const { data, error } = await this.client
      .from("companies")
      .insert({
        name: input.name,
        source: input.source,
        board_token: input.boardToken,
        active: input.active ?? true,
      })
      .select("*")
      .single();

    if (error) throw toAppError(error);
    return toCompany(data);
  }

  async update(id: string, input: CompanyUpdate): Promise<Company> {
    const row: CompanyUpdateRow = {};
    if (input.name !== undefined) row.name = input.name;
    if (input.source !== undefined) row.source = input.source;
    if (input.boardToken !== undefined) row.board_token = input.boardToken;
    if (input.active !== undefined) row.active = input.active;

    const { data, error } = await this.client.from("companies").update(row).eq("id", id).select("*").single();

    if (error) throw toAppError(error);
    return toCompany(data);
  }

  async updateHealth(id: string, update: SourceHealthUpdate): Promise<void> {
    const row: CompanyUpdateRow = {
      health_status: update.healthStatus,
      consecutive_failures: update.consecutiveFailures,
    };
    if (update.lastSuccessAt !== undefined) row.last_success_at = update.lastSuccessAt;
    if (update.lastFailureAt !== undefined) row.last_failure_at = update.lastFailureAt;

    const { error } = await this.client.from("companies").update(row).eq("id", id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from("companies").delete().eq("id", id);
    if (error) throw toAppError(error);
  }
}

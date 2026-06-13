"use server";

import { revalidatePath } from "next/cache";
import { validateNewCompany } from "@/features/companies/domain/validation";
import type { Company, NewCompany } from "@/features/companies/domain/types";
import { SupabaseCompanyRepository } from "@/features/companies/infrastructure/SupabaseCompanyRepository";
import type { ActionResult } from "@/shared/actionResult";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

// frontend.md §3 -- companies CRUD for /settings.
export async function createCompanyAction(input: NewCompany): Promise<ActionResult<Company>> {
  try {
    validateNewCompany(input);

    const client = await createSupabaseServerClient();
    const companyRepository = new SupabaseCompanyRepository(client);
    const result = await companyRepository.create(input);

    revalidatePath("/settings");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function updateCompanyAction(id: string, input: NewCompany): Promise<ActionResult<Company>> {
  try {
    validateNewCompany(input);

    const client = await createSupabaseServerClient();
    const companyRepository = new SupabaseCompanyRepository(client);
    const result = await companyRepository.update(id, input);

    revalidatePath("/settings");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function deleteCompanyAction(id: string): Promise<ActionResult> {
  try {
    const client = await createSupabaseServerClient();
    const companyRepository = new SupabaseCompanyRepository(client);
    await companyRepository.remove(id);

    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

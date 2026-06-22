import type { RoleExpansionProvider } from "@/features/roles/domain/RoleExpansionProvider";
import { callOpenRouterJson } from "@/shared/infrastructure/openrouterClient";

const SCHEMA = {
  type: "object",
  properties: {
    relatedRoles: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["relatedRoles"],
  additionalProperties: false,
} as const;

interface RoleExpansionResponse {
  relatedRoles?: unknown;
}

// AI fallback for role expansion (architecture.md §3.4, decisions.md AD-06).
// Failures propagate -- expandRole has no cached value to fall back to, so
// the caller surfaces the error to the user.
export class OpenRouterRoleExpansionProvider implements RoleExpansionProvider {
  async expand(primaryRole: string): Promise<string[]> {
    const { payload } = await callOpenRouterJson({
      messages: [
        {
          role: "system",
          content:
            "You are a career taxonomy assistant. Given a job role, return closely related " +
            "job titles that a candidate qualified for the primary role would also be " +
            "qualified for and interested in seeing job postings for.",
        },
        {
          role: "user",
          content: `Primary role: "${primaryRole}". Return 4-8 related role titles.`,
        },
      ],
      schemaName: "role_expansion",
      schema: SCHEMA,
    });
    const result = payload as RoleExpansionResponse;

    if (!Array.isArray(result.relatedRoles)) {
      throw new Error("OpenRouter role expansion response missing relatedRoles array");
    }

    return result.relatedRoles.filter((role): role is string => typeof role === "string");
  }
}

// Port for the AI fallback in expandRole (architecture.md §3.4,
// decisions.md AD-06). Implemented by an OpenRouter-backed adapter in
// infrastructure -- never imported directly by application code.
export interface RoleExpansionProvider {
  /** Returns related role titles for a role not found in role_expansion_map. */
  expand(primaryRole: string): Promise<string[]>;
}

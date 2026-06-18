# 📐 Design Documents

Technical and product design documentation for the Job Intelligence Platform.

| Document | Description |
|---|---|
| [technical-design.md](technical-design.md) | Goals, principles, system components, and all data flows |
| [architecture.md](architecture.md) | Clean architecture layers, runtime topology, and component diagrams |
| [erd.md](erd.md) | Full database schema — tables, enums, indexes, constraints, and RPC functions |
| [tech-stack.md](tech-stack.md) | Technology choices, environment variables, and npm scripts |
| [use-cases.md](use-cases.md) | Actor catalogue, 12 use cases, and user story summary |
| [scope.md](scope.md) | In-scope / out-of-scope features and the P0–P4 phase roadmap |
| [limitations.md](limitations.md) | Known limitations, constraints, and technical debt |
| [user-guide.md](user-guide.md) | End-user walkthrough for all platform features |
| [api-reference.md](api-reference.md) | Server actions, app routes, external API contracts |
| [security.md](security.md) | Auth, RLS, service-role boundary, secrets management |

## 🔄 Maintenance Rule

**Every code change must update the relevant document(s) here before the PR is merged.**

| Change type | Document(s) to update |
|---|---|
| New feature or removal | `use-cases.md`, `scope.md` |
| Data model change | `erd.md` |
| Architecture change | `architecture.md`, `technical-design.md` |
| New dependency, env var, or npm script | `tech-stack.md` |
| New server action or API route | `api-reference.md` |
| Auth, RLS, or storage change | `security.md` |
| New limitation or known issue | `limitations.md` |
| UX / workflow change | `user-guide.md` |
| Scope or roadmap change | `scope.md` |

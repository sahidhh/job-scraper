# 📐 Design Documents

Technical and product design documentation for the Job Intelligence Platform.

| Document | Description |
|---|---|
| [technical-design.md](technical-design.md) | Goals, principles, system components, and all data flows |
| [architecture.md](architecture.md) | Clean architecture layers, runtime topology, component diagrams, and presentation-layer conventions |
| [erd.md](erd.md) | Full database schema — tables, enums, indexes, constraints, and RPC functions |
| [tech-stack.md](tech-stack.md) | Technology choices, environment variables, npm scripts, and the design-token / theming reference |
| [use-cases.md](use-cases.md) | Actor catalogue, 23 use cases (UC-01–UC-19 plus sub-cases), and user story summary |
| [scope.md](scope.md) | In-scope / out-of-scope features and the P0–P4 phase roadmap |
| [limitations.md](limitations.md) | Known limitations, constraints, and technical debt |
| [user-guide.md](user-guide.md) | End-user walkthrough for all platform features |
| [api-reference.md](api-reference.md) | Server actions, app routes, external API contracts, and the dashboard filter/sort/pagination contract |
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
| UI / design-system change (token, component convention, navigation surface) | `tech-stack.md` §8, `architecture.md` §12 |
| Scope or roadmap change | `scope.md` |

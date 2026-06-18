# Design Documentation

This folder contains all technical and product design documents for the Job Intelligence Platform.

## Documents

| Document | Description |
|---|---|
| [technical-design.md](technical-design.md) | Detailed technical design covering goals, components, and data flows |
| [architecture.md](architecture.md) | System architecture, clean architecture layers, and component diagrams |
| [erd.md](erd.md) | Entity Relationship Diagram — full database schema |
| [tech-stack.md](tech-stack.md) | Technology choices with rationale |
| [use-cases.md](use-cases.md) | Actor/use-case catalogue and user stories |
| [scope.md](scope.md) | Project scope, in-scope / out-of-scope boundaries, and phase roadmap |
| [limitations.md](limitations.md) | Known limitations, constraints, and trade-offs |
| [user-guide.md](user-guide.md) | End-user guide for all platform features |
| [api-reference.md](api-reference.md) | Server actions, API routes, and external API contracts |
| [security.md](security.md) | Security design: auth, RLS, service-role boundary, storage policies |

## Maintenance Rule

**Every code change that affects data models, features, workflows, or architecture must update the relevant document(s) in this folder before the PR is merged.**

See the project CLAUDE.md for the enforcement rule.

---
date: 2026-01-15
status: active
---

# Postgres as the default database

**Decision:** new projects start on Postgres.

**Why:** one database we know well beats picking a new one per project; it runs the same
in a container for tests and in production.

**Revisit when:** a project needs something Postgres is bad at (for example, heavy full-text search at scale).

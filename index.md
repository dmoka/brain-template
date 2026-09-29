# Index

Read this first. One line per file: what it is, so you know whether to open it.

## Guidelines
- [Integration tests use a real database](guidelines/integration-tests-real-database.md) — never mock the database in integration tests; start a real one in a container.

## Decisions
- [2026-01-15 Postgres as the default database](decisions/2026-01-15-postgres-default-database.md) — new projects start on Postgres unless there is a reason not to.

## Projects
- [Example app](projects/example-app.md) — what it is, where it runs, its status.

## Notes
- [Why mocks hide database bugs](notes/why-mocks-hide-database-bugs.md) — the failure modes a mocked database misses, with the source.

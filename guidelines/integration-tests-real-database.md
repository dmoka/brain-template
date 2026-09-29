# Integration tests use a real database

**Rule:** integration tests run against a real database, started in a container
(for example with Testcontainers). Never a mock of the database.

**Why:** the bugs that matter live in the real queries, constraints, and transactions.
A mock returns what you told it to, so those bugs pass. See [why mocks hide database bugs](../notes/why-mocks-hide-database-bugs.md).

**How:** one container per test run, a fresh schema per test file, migrations applied the same way as in production.

Source: [sources/2026-01-15-testing-talk-notes.md](../sources/2026-01-15-testing-talk-notes.md)

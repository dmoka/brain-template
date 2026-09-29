# Why mocks hide database bugs

A mocked database returns what the test told it to return. So these bugs pass the test and fail in production:

- a query that is wrong for real data (wrong join, missing index, collation),
- a constraint the database enforces and the mock does not,
- two writes that conflict inside a transaction.

That is why the [integration test guideline](../guidelines/integration-tests-real-database.md) starts a real database.

Source: [sources/2026-01-15-testing-talk-notes.md](../sources/2026-01-15-testing-talk-notes.md)

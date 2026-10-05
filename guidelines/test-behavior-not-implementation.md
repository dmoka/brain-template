# Test behavior, not implementation

**Rule:** tests call the code the way the rest of the system calls it: the public API,
a route, an exported function. Never a private helper, never an assertion on which
internal function was called, never a mock of your own modules.

**Why:** a test tied to the implementation breaks on every refactor, even when nothing
is broken. Then red stops meaning "bug", and agents learn to fix red by editing the
test. Models do not follow this by default; left alone they test helpers and mock
everything.

**How:** before writing a test, name the behavior a caller would notice. Assert on
outputs and on state a caller can see. A refactor that changes no behavior must leave
every test green; if one goes red, rewrite that test, not the code.

Source: [sources/2026-01-18-refactor-broke-tests-notes.md](../sources/2026-01-18-refactor-broke-tests-notes.md)

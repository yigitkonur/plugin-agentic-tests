## Self-check before you submit

The plan auditor opens everything you wrote. Fix these before it does:

1. **Every asserted fact has a capture.** Each fact an expectation's `statement` or `observable.description` asserts (a URL path, a heading, a count, a status code, a field value, a message) has an evidence requirement that captures exactly that fact, and a step in `03-how-to-run.md` that saves it. When a statement names a page or path, the saved snapshot or text also records the current URL path.
2. **Priority and reviews agree everywhere.** The case header's priority equals the highest priority among its expectations. An expectation behind sign-in, or about the signed-in user's own data, or about payment or stored data, is `critical: true` with `review_count: 2` unless the assignment's review policy sets another count. The header, the manifest and the table in `01-test-case.md` show identical values.
3. **IDs are unique and consistent.** Expectation IDs and requirement IDs are unique within the case and appear identically in the Markdown, the recipe and the manifest.

# AI-Assisted Testing Defaults

Source note: Adapted from Jovanovikj et al., "Context-specific Quality Evaluation of Test Cases" (MODELSWARD 2018). Do not fetch or read the paper during normal coding work; use the rules below as the operational policy.

When writing or modifying tests, use a lightweight context-specific test quality process inspired by Goal-Question-Metric / Test Case Quality Plan thinking.

Before writing tests:

- Identify the test context: unit, integration, regression, UI, contract, migration, security, etc.
- Identify the risk the tests should reduce.
- State the quality goal in one sentence.

When proposing tests:

- Prefer behavior-focused tests over implementation-detail tests.
- Each important test should protect a real behavior, invariant, contract, or known risk.
- Include boundary, failure, and regression cases when relevant.
- Avoid tests that only assert that code runs without checking meaningful outcomes.
- Avoid excessive mocking, especially mocking the behavior under test.
- Use clear test names that describe the expected behavior.

After writing tests:

- Review tests for fault-revealing capability, readability, maintainability, brittleness, redundancy, and missing assertions.
- For bug fixes, ensure at least one test would fail on the old behavior when feasible.
- Run the relevant test command.
- If tests are weak, revise them instead of merely adding more coverage.

When using AI to generate tests:

- First draft a short test plan listing scenarios, risks covered, and expected outcomes.
- Then implement the tests.
- Then critique the generated tests against the quality goals above.

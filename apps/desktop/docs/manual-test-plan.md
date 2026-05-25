# Manual Test Plan

1. First launch: app opens, empty state, no startup errors.
2. Persistence: create project/task, restart app, verify data remains.
3. Browser login: Open ChatGPT opens visible Chrome/Edge profile and allows login persistence.
4. Full AI run: clarification -> run AI -> response appears in app.
5. Invalid JSON: parse fails, raw response remains editable.
6. Browser closed manually: run reports clear failure and logs error.
7. Timeout: force timeout and verify timeout failure metric increments.
8. Double run: second run request while active run is blocked.
9. Later flaw: choosing Later creates a child task in Clarification.
10. Step completion: ready_for_codex task can mark steps done and moves to Done.
11. Extraction failure: retry extraction available and logs failure if no page.
12. Protective block: provider detects and fails with clear message.
13. Usage limit: provider detects usage cap and fails with clear message.
14. App close during waiting_response: task restarts in failed state with recovery message.
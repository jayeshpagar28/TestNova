# QA pipeline artifacts

Each numbered directory holds the output of one AI Pipeline stage. Every stage consumes the
previous stage's files, so the chain is auditable end to end. The rules for each stage are in
`prompts/master-prompt.md`; the agents are in `.claude/agents/`.

| Dir | Stage | Produced by | Read by |
|---|---|---|---|
| `01-user-story/` | 1 — read knowledge sources, explore the app | `ba-explorer` | stage 2 |
| `00-knowledge-base/` | 2 — knowledge base (`knowledge-base.md`, `knowledge-base.json`) | `knowledge-base-builder` | every later stage; the dashboard's module list |
| `03-test-plan/` | 3 — `<module>-test-plan.md` | `test-planner` | stages 4, 5; dashboard priority/steps/expected |
| `04-exploratory/` | 4 — manual execution with the Human-Like Testing Heuristics | `exploratory-tester` | stages 5, 7, 8 |
| `../src`, `../tests/e2e` | 5 — POM automation | `test-generator` | stage 6; dashboard test list |
| `05-healing/` + `../dashboard/data/runs/` | 6 — execution through the TestNova runner, healing | `test-healer` | stages 7, 8; dashboard results |
| `06-report/<project>-defects.{json,xlsx}` | 7 — defect analysis | `defect-analyst` | dashboard Defects page, stage 8 |
| `06-report/<project>-test-report.{md,pdf,xlsx}` | 8 — QA report | `qa-reporter` | people |

`00-knowledge-base` is numbered 00 because it is the reference every other stage reads, even
though it is produced second. No file here ever contains a credential value: credentials live in
`.env` on the PC running TestNova.

# Testing types

The Project Setup screen offers four testing types. The type is chosen when a project is created,
and every run of that project's AI Pipeline follows it: only that type's dedicated agents run (a UI
project never runs the functional or security agents). Projects created before testing types
existed are Full Coverage. The type of an existing project can be changed on the Setup screen; the
next start then switches its pipeline: stages 1–2 are kept, stages 3–8 run again for the new type,
and their previous outputs move to `qa/archive/<type>-<time>/`.

| Testing type | Standard (what to test, rules) | Pipeline rules (how it runs in TestNova) | Stage 3 / 4 agents |
|---|---|---|---|
| Full Coverage (Current Behaviour), default | `full-coverage/TestNova_Full_Coverage_Testing_Standard.md` | `prompts/master-prompt.md` | `test-planner` / `exploratory-tester` |
| UI Testing | `ui/TestNova_UI_Testing_Standard.md` | `ui/TestNova_UI_Pipeline_Rules.md` | `ui-test-planner` / `ui-tester` |
| Functional Testing | `functional/TestNova_Functional_Testing_Standard.md` | `functional/TestNova_Functional_Pipeline_Rules.md` | `functional-test-planner` / `functional-tester` |
| Security Testing | `security/TestNova_Security_Testing_Standard.md` | `security/TestNova_Security_Pipeline_Rules.md` | `security-test-planner` / `security-tester` |

Stages 1–2 (BA Agent, knowledge base) are the same for every type. Stages 5–8 use the standard
agents and read the "Stage 5" to "Stage 8" sections of the type's pipeline rules.

## Which document wins

1. **The testing standard** is authoritative for what is in scope, its Do / Don't lists, evidence
   and completion criteria. Its prohibitions are never relaxed.
2. **The pipeline rules** say how the standard runs here: which of its sections TestNova can and
   cannot perform (the applicability map), the defaults used when the project does not specify
   something, the case budget, and each stage's outputs. They may narrow the standard, never
   widen it or relax a prohibition.
3. **`prompts/master-prompt.md`** governs file formats (the readable test case table), evidence
   tags (`[NOT VERIFIED]`, `[GAP]`, `[CONFLICT]`), checkpoints, process safety and credential
   handling for every type. In a typed run its Step 2 coverage list does **not** apply: the run
   plans only its own type's categories.

## Anti-hallucination rules, for every type

- A category the applicability map marks **Not tested** is never planned, never given a result,
  and always listed in the report's limitations with its reason.
- An expected result needs a source: a requirement, acceptance criterion, business rule,
  approved design, the application's established convention, a cited standard criterion (e.g. a
  WCAG success criterion), or a universal rule the pipeline rules name. No source: it is a
  `[GAP]` or an observation, never a defect.
- The pipeline runs unattended. Where a standard says "ask", "confirm" or "request
  clarification", record a `[GAP]` and continue with the documented default.

# LinkedIn post: TestNova

## Post (paste as-is, ~2,600 characters)

What if your test suite could read the requirements, explore the app, write its own automation, run it, and explain every failure, while your QA team decides what ships?

For years, testing has scaled with headcount. Here's what that looks like in practice:

→ Manual regression repeats the same clicks every release
→ Automation scripts break when a locator changes, and someone has to fix them
→ Every new module adds more regression time
→ A red test still needs a person to work out whether it's a bug, a script problem or the environment
→ Reports get assembled by hand at the end

So I built TestNova, an agentic AI testing platform. It's not a chatbot attached to a framework. It's a pipeline of 8 specialised AI agents, each with one job, its own instructions and its own tool permissions:

1️⃣ BA Agent reads the project docs and explores the live application
2️⃣ Knowledge Base agent maps modules, roles, flows and business rules, and every fact cites its source
3️⃣ Test Planner writes per-module plans covering negative paths, validation, responsive layouts, network failure and accessibility
4️⃣ Exploratory Tester executes the plan by hand in a real browser before any script exists
5️⃣ Test Generator writes Playwright automation on a Page Object Model
6️⃣ Test Healer runs every module and repairs broken scripts. It is forbidden to weaken an assertion, so a real bug gets tagged, not hidden
7️⃣ Defect Analyst classifies each failure as App defect, Script, Environment or Test data
8️⃣ QA Reporter produces the narrative, and the report engine builds the PDF and Excel

A rule I learned early: never trust an agent that says "done". The orchestrator advances only when a stage's files exist and validate. Generated tests must pass the TypeScript typecheck. Healed tests count only after they are re-executed. Stages checkpoint so they can resume, and a guard hook blocks risky shell commands.

The video shows a real regression: 115 test cases across 5 modules, executing live. Statuses update as each test runs, failures are linked to defects, and each test keeps its screenshot, trace, video and accessibility scan as evidence. (Client details are blurred.)

So far, 3 real web projects have gone through the full pipeline: 442 test cases planned and automated, and 47 defects logged with evidence.

What this changes:
✅ Less repetitive manual regression
✅ Less script writing and locator maintenance
✅ Failures arrive pre-triaged, with evidence
✅ Stakeholder-ready reports straight from the run
✅ Faster, more consistent feedback on every build

What it doesn't change: QA judgment still matters. Review gates after the knowledge base, test plan and exploratory stages put people in charge of what gets automated, and release decisions, business context and true exploratory thinking stay human.

The shift I'm betting on: we're moving from writing automation scripts to building systems that understand, plan, execute, analyse and report on software testing.

QA leaders and engineers: which part of your testing lifecycle would you trust an agent with first, and which would you never hand over?

#AgenticAI #SoftwareTesting #QualityAssurance #TestAutomation #Playwright #AIinTesting #QA #ClaudeAI #DevOps #SoftwareEngineering

---

## First comment (technical breakdown, post right after publishing)

For those asking "how is it built?":

🧠 Agents: 8 Claude subagents run through the Claude Agent SDK. Each has its own system prompt and tool allow-list. For example, the Knowledge Base, Defect Analyst and QA Reporter agents get no browser tools at all. Only the agents whose job needs a browser get one.
🌐 Browser access: Playwright MCP for agent exploration. Playwright Test (Chromium/Firefox/WebKit) for execution.
🗂️ Shared memory: a per-project workspace. Docs (PDF/DOCX parsed with unpdf and mammoth) → user stories → knowledge-base.json → test plans → exploratory results → POM specs → run results → defect log → reports. Agents hand work to each other through these files, not chat.
⚙️ Orchestration: a Node.js server runs one stage at a time with per-stage validation, review gates, checkpoints and resume, a 90-minute stage limit, and a PreToolUse guard hook.
📡 Execution: a custom Playwright reporter streams events to the server, and the dashboard updates live. Evidence per test includes the failure screenshot, trace, video, console/network "web signals" and an axe-core accessibility scan.
🐞 Defects: classified as App defect / Script / Environment / Test data, with priority, severity, status history and aliases linking provisional bug IDs to the register.
📊 Reporting: a React 19 + Vite + Tailwind dashboard. One report model feeds the dashboard, PDF (Chromium) and Excel (ExcelJS), so the numbers always agree. Technical errors are translated into plain language for stakeholders.
☁️ Sharing: a Supabase mirror with sign-in and roles for remote viewers.

---

## Suggested media order (carousel or multi-image)

LinkedIn won't mix a video and images in one post. Pick one of these:

**Option A (recommended): video post.** `01-demo.mp4` (1:47, real run, client details blurred, live part at 4× and labelled). Then post the images as a follow-up post or in the comments.

**Option B: image post (up to 20 images).**
1. `02-agent-workflow.png`: the 8-agent architecture
2. `03-regression-dashboard.png`: completed regression (115 / 80 / 35)
3. `03b-regression-test-cases.png`: test case table with failure reasons and defects
4. `04-module-detail.png`: module drill-down
5. `05-test-evidence.png`: one failed test with expected/received values and evidence
6. `06-defect-register.png`: the consolidated defect register
7. `07-pdf-excel-reports.png`: real pages of the generated PDF and Excel
8. `09-ai-pipeline.png`: the 8 stages as they ran

Extras: `06b-qa-report-overview.png`, `04b-module-tests.png`, `10-dashboard-home.png`.

Alt text for the workflow image: "Diagram of TestNova's eight AI agents in sequence, from BA exploration through knowledge base, test planning, exploratory testing, test generation, healing, defect analysis and QA reporting, with orchestrator, execution and reporting layers."

# Specs

Scratch directory for the official `playwright-test-planner` agent's `planner_save_plan` output.
TestNova's pipeline does not read from here: stage 3 writes the authoritative per-module plans to
`qa/03-test-plan/<module>-test-plan.md`, which the dashboard parses.

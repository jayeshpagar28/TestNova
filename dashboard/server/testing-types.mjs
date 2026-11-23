/**
 * Testing types: what a project tests. Chosen when the project is created (project.json
 * `testingType`); recorded on each pipeline run, so one run never mixes agents. Changing an existing
 * project's type makes its next start switch the run (pipeline.mjs: stages 3–8 again, old outputs
 * archived).
 *
 * No type (null) is "Full Coverage (Current Behaviour)": the eight standard agents and
 * prompts/master-prompt.md, as before (every project created before testing types existed).
 * A type swaps the stage 3 and 4 agents for its dedicated ones, never runs another type's agents,
 * and scopes stages 3 to 8 to its own activities through the type's standard and pipeline rules
 * (prompts/testing-types/<dir>/, one "Stage N" section per stage). Stages 1–2 (exploring the
 * application, building the knowledge base) are the same for every type.
 */

export const FULL_COVERAGE = {
  key: null,
  label: 'Full Coverage (Current Behaviour)',
  standard: 'prompts/testing-types/full-coverage/TestNova_Full_Coverage_Testing_Standard.md',
};

export const TESTING_TYPES = {
  ui: {
    key: 'ui', label: 'UI Testing', prefix: 'UI', tag: '@ui', code: /^UI-2\.\d+\b/,
    standard: 'prompts/testing-types/ui/TestNova_UI_Testing_Standard.md',
    rules: 'prompts/testing-types/ui/TestNova_UI_Pipeline_Rules.md',
    artifact: 'qa/03-test-plan/ui-inventory.md',
    stages: {
      3: { agent: 'ui-test-planner', name: 'UI Test Planner Agent', title: 'Create the UI test plan' },
      4: { agent: 'ui-tester', name: 'UI Testing', title: 'Perform UI testing in a real browser' },
    },
    available: true,
  },
  functional: {
    key: 'functional', label: 'Functional Testing', prefix: 'FN', tag: '@functional', code: /^FN-2\.\d+\b/,
    standard: 'prompts/testing-types/functional/TestNova_Functional_Testing_Standard.md',
    rules: 'prompts/testing-types/functional/TestNova_Functional_Pipeline_Rules.md',
    artifact: 'qa/03-test-plan/rules-matrix.md',
    stages: {
      3: { agent: 'functional-test-planner', name: 'Functional Test Planner Agent', title: 'Create the functional test plan' },
      4: { agent: 'functional-tester', name: 'Functional Testing', title: 'Perform functional testing in a real browser' },
    },
    available: true,
  },
  security: {
    key: 'security', label: 'Security Testing', prefix: 'SEC', tag: '@security', code: /^SEC-(A\d{2}|API)\b/,
    standard: 'prompts/testing-types/security/TestNova_Security_Testing_Standard.md',
    rules: 'prompts/testing-types/security/TestNova_Security_Pipeline_Rules.md',
    artifact: 'qa/03-test-plan/attack-surface.md',
    stages: {
      3: { agent: 'security-test-planner', name: 'Security Test Planner Agent', title: 'Map the attack surface and plan the security tests' },
      4: { agent: 'security-tester', name: 'Security Testing', title: 'Perform safe security testing in a real browser' },
    },
    requiresAuthorization: true,
    // shell commands of a Security run pass guard.mjs in "security" mode
    guard: 'security',
    available: true,
  },
};

/** The type's definition, or null for Full Coverage (and for anything unknown). */
export const typeOf = (key) => (key && Object.hasOwn(TESTING_TYPES, key) ? TESTING_TYPES[key] : null);
export const labelOf = (key) => typeOf(key)?.label ?? FULL_COVERAGE.label;

/** A value project.json may hold: null (Full Coverage) or a known type key. */
export function parseTestingType(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'full') return null;
  if (typeof raw === 'string' && typeOf(raw)) return raw;
  throw Object.assign(new Error(`Unknown testing type "${raw}". Choose Full Coverage, ${Object.values(TESTING_TYPES).map((t) => t.label).join(', ')}.`), { status: 400 });
}

/** Why this type cannot run yet, or null. */
export function unavailable(key) {
  const t = typeOf(key);
  return t && !t.available ? `${t.label} is not available yet: it is enabled once it has been validated with a measured run.` : null;
}

/**
 * A stage as this run sees it: Full Coverage keeps the standard definition unchanged; a type
 * replaces the agent, name and title of the stages it owns. check/counts/outputs are kept.
 */
export function resolveStage(def, key) {
  const own = typeOf(key)?.stages[def.n];
  return own ? { ...def, ...own } : def;
}

/** The lines a typed run adds to every stage prompt; Full Coverage gets one pointer to its standard. */
export function typePrompt(key, n) {
  const t = typeOf(key);
  // stages 1–2 are the same for every testing type: no type instructions there
  if (t && n <= 2) return '';
  if (!t) {
    return `Testing type: ${FULL_COVERAGE.label}. The scope and limits of this run are in ${FULL_COVERAGE.standard}; prompts/master-prompt.md remains your execution instruction.`;
  }
  return [
    `Testing type: ${t.label}. This run tests ${t.label.replace(/ Testing$/, '').toLowerCase()} only.`,
    `Your instructions for it, in this order of authority: ${t.standard} (the standard), then ${t.rules} (the TestNova pipeline rules: read its applicability map and its "Stage ${n}" section). Where they and prompts/master-prompt.md differ on what to cover, they win; the master prompt still governs file formats, evidence tags, checkpoints, safety and credentials. Never plan, run or report a category the applicability map marks Not tested; list it as a limitation.`,
    n >= 4 ? 'Modules in scope for this testing type: qa/03-test-plan/scope.json. Work on those modules only.' : '',
    n >= 5 ? `Test case ids carry the type prefix (TC-${t.prefix}-<MODULE>-NNN); every automated test title carries the ${t.tag} tag.` : '',
  ].filter(Boolean).join('\n');
}

/** A test's testing type, from its tag or its TC id prefix; null when it has neither. */
export function testTypeOf(title, tags = []) {
  for (const t of Object.values(TESTING_TYPES)) {
    if (tags.includes(t.tag) || new RegExp(`(^|\\s)${t.tag}\\b`).test(title) || new RegExp(`\\bTC-${t.prefix}-`).test(title)) return t.key;
  }
  return null;
}

/** For the Setup screen: every option, Full Coverage first. */
export const testingTypeOptions = () => [
  { key: null, label: FULL_COVERAGE.label, available: true },
  ...Object.values(TESTING_TYPES).map((t) => ({ key: t.key, label: t.label, available: t.available })),
];

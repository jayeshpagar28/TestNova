/**
 * Automation errors in words a non-technical reader understands.
 *
 * Every explanation is derived from the error itself (the values the check expected and received)
 * or from the defect record a person or the defect analysis wrote. Nothing is guessed: when an
 * error matches no known pattern the explanation says only that the check did not get the expected
 * result, and the original message stays available as technical detail.
 */

/** axe-core rule ids (and their "help" sentences) as plain sentences. */
const A11Y_RULES = {
  'color-contrast': 'Some text does not stand out enough from its background to be read comfortably.',
  'color-contrast-enhanced': 'Some text does not meet the higher contrast level.',
  'aria-hidden-focus': 'Keyboard users can reach elements that are hidden from screen readers, so they land on something that is not announced.',
  'image-alt': 'Some images have no text alternative, so screen-reader users do not know what they show.',
  'link-name': 'Some links have no readable name, so screen-reader users cannot tell where they lead.',
  'button-name': 'Some buttons have no readable name, so screen-reader users cannot tell what they do.',
  'heading-order': 'Heading levels are skipped, which makes the page structure confusing for screen-reader users.',
  'page-has-heading-one': 'The page has no main heading.',
  'landmark-one-main': 'The page does not mark its main content area.',
  region: 'Some content sits outside the marked areas of the page, so screen-reader users can miss it.',
  label: 'Some form fields have no label, so users of assistive technology do not know what to enter.',
  'aria-allowed-attr': 'Some elements use accessibility attributes that are not allowed on them.',
  'aria-valid-attr-value': 'Some accessibility attributes have invalid values.',
  'aria-required-children': 'Some interactive structures are missing parts that assistive technology expects.',
  'aria-required-parent': 'Some elements are used outside the structure they belong to.',
  'aria-prohibited-attr': 'Some elements use accessibility attributes that are not permitted on them.',
  list: 'Some lists are built incorrectly, so screen readers may not announce them as lists.',
  listitem: 'Some list items are not inside a list, so screen readers may not announce them correctly.',
  'nested-interactive': 'Some clickable elements are placed inside other clickable elements, which assistive technology cannot handle reliably.',
  'scrollable-region-focusable': 'Some scrollable areas cannot be reached by keyboard.',
  'frame-title': 'Some embedded frames have no title.',
  'html-has-lang': 'The page does not declare its language.',
  'duplicate-id': 'Some elements share the same identifier.',
  'duplicate-id-aria': 'Some elements referenced by assistive technology share the same identifier.',
  'link-in-text-block': 'Some links inside text can only be told apart by colour.',
  'select-name': 'Some drop-down lists have no label.',
  'target-size': 'Some touch targets are too small.',
  'meta-viewport': 'The page prevents users from zooming.',
  'empty-heading': 'Some headings are empty.',
  'svg-img-alt': 'Some graphics have no text alternative.',
  'role-img-alt': 'Some images have no text alternative.',
  'aria-command-name': 'Some controls have no readable name.',
  'aria-input-field-name': 'Some input fields have no readable name.',
  'aria-toggle-field-name': 'Some toggles have no readable name.',
  'input-button-name': 'Some input buttons have no readable name.',
};

const HELP_TO_RULE = [
  [/minimum color contrast/i, 'color-contrast'],
  [/ARIA hidden element must not be focusable/i, 'aria-hidden-focus'],
  [/Images must have alternate text/i, 'image-alt'],
  [/Links must have discernible text/i, 'link-name'],
  [/Buttons must have discernible text/i, 'button-name'],
  [/Heading levels should only increase by one/i, 'heading-order'],
  [/supported ARIA attributes|ARIA attributes must be allowed/i, 'aria-allowed-attr'],
  [/must have valid values/i, 'aria-valid-attr-value'],
  [/must be contained by a landmark|content should be contained by landmarks/i, 'region'],
  [/must have labels/i, 'label'],
  [/<ul> and <ol> must only directly contain/i, 'list'],
  [/<li> elements must be contained/i, 'listitem'],
  [/Interactive controls must not be nested/i, 'nested-interactive'],
  [/Scrollable region must have keyboard access/i, 'scrollable-region-focusable'],
  [/IDs .* must be unique/i, 'duplicate-id'],
  [/Links must be distinguishable/i, 'link-in-text-block'],
];

export const a11yRule = (id) => A11Y_RULES[id] ?? null;

/** "The check expected …" phrases need short values: long ones are cut, quotes kept. */
const short = (v, n = 80) => {
  const s = String(v ?? '').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const unquote = (s) => String(s ?? '').trim().replace(/^"(.*)"$/s, '$1');
const list = (items, max = 4) => {
  const u = [...new Set(items)];
  return u.length <= max ? u.join(', ') : `${u.slice(0, max).join(', ')} and ${u.length - max} more`;
};

/** Describe a Playwright locator ("getByRole('button', { name: 'Search' })") as "the button "Search"". */
function element(text) {
  // a chained locator names its target last: getByRole('banner').getByRole('link', { name: 'X' })
  const role = [...text.matchAll(/getByRole\('(\w+)'(?:,\s*\{\s*name:\s*'([^']+)')?/g)].at(-1);
  if (role) return `the ${role[1]}${role[2] ? ` "${role[2]}"` : ''}`;
  const label = text.match(/getBy(?:Label|Text|Placeholder|Title)\('([^']+)'/);
  if (label) return `the element "${label[1]}"`;
  return 'the expected element';
}

/** The added lines of a Jest-style diff: `+ "x"` and `+ "key": n`. */
function diffAdded(message) {
  const strings = [];
  const pairs = [];
  const helps = [];
  for (const line of message.split('\n')) {
    const help = line.match(/^\+\s+"help":\s*"(.+)",?$/);
    if (help) helps.push(help[1]);
    const pair = line.match(/^\+\s+"([^"]+)":\s*(-?\d+(?:\.\d+)?),?$/);
    if (pair) pairs.push([pair[1], Number(pair[2])]);
    const str = line.match(/^\+\s+"([^"]+)",?$/);
    if (str) strings.push(str[1]);
  }
  return { strings, pairs, helps };
}

/** Accessibility findings like "home/normal/color-contrast" or "home: skipped level". */
function a11yFindings(strings) {
  const rules = [];
  const where = [];
  for (const s of strings) {
    const parts = s.split('/');
    if (parts.length === 3 && A11Y_RULES[parts[2]]) {
      rules.push(parts[2]);
      where.push(parts[0]);
    }
  }
  return { rules: [...new Set(rules)], pages: [...new Set(where)] };
}

/**
 * What went wrong, in one or two sentences, from the error message. Returns null when the
 * message matches nothing known (the caller then falls back to a neutral sentence).
 */
export function explainError(message) {
  const m = String(message ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  if (!m.trim()) return null;

  // navigation and timing
  if (/page\.goto:.*Timeout|Navigation timeout|net::ERR_TIMED_OUT/i.test(m)) return 'The page did not finish loading within the allowed time.';
  if (/net::ERR_NAME_NOT_RESOLVED|net::ERR_CONNECTION/i.test(m)) return 'The application could not be reached.';
  if (/Test timeout of \d+ms exceeded/i.test(m)) return 'The test ran out of time before it could finish its checks; the application responded too slowly.';
  if (/locator\.(click|fill|check|press|selectOption).*Timeout/is.test(m)) {
    const covered = /intercepts pointer events/i.test(m);
    return `${element(m).replace(/^the/, 'The')} could not be used within the allowed time${covered ? ' because another part of the page was covering it' : ''}.`;
  }
  if (/TimeoutError|Timeout \d+ms exceeded/i.test(m) && /waiting for/i.test(m)) return `${element(m).replace(/^the/, 'The')} did not appear within the allowed time.`;

  // visibility
  if (/toBeHidden\(\)/.test(m)) return `${element(m).replace(/^the/, 'The')} should have been hidden, but it stayed visible.`;
  if (/toBeVisible\(\)/.test(m)) return `${element(m).replace(/^the/, 'The')} should have been visible, but it was not.`;
  if (/toHaveURL\(/.test(m)) {
    const exp = m.match(/Expected (?:pattern|string):\s*(.+)/)?.[1];
    const rec = m.match(/Received string:\s*(.+)/)?.[1];
    return `The browser ended up on a different page${rec ? ` (${short(unquote(rec))})` : ''}${exp ? ` than expected (${short(unquote(exp))})` : ''}.`;
  }
  if (/toHaveTitle\(/.test(m)) return 'The page title is not the expected one.';
  if (/toHaveCount\(/.test(m)) {
    const exp = m.match(/Expected:\s*(\d+)/)?.[1];
    const rec = m.match(/Received:\s*(\d+)/)?.[1];
    return `Expected ${exp ?? 'a different number of'} matching elements on the page${rec != null ? `, found ${rec}` : ''}.`;
  }

  // text content
  const notContain = m.match(/not\.toContain\(expected\)[\s\S]*?Expected (?:substring|value):\s*not\s*(.+)\n\s*Received (?:string|array):\s*(.+)/);
  if (notContain) return `${short(unquote(notContain[1]), 60)} should not be present, but it was found.`;
  const contain = m.match(/toContain\(expected\)[\s\S]*?Expected (?:substring|value):\s*(.+)\n\s*Received (?:string|array):\s*(.*)/);
  if (contain) {
    const exp = short(unquote(contain[1]), 60);
    const rec = unquote(contain[2]);
    return rec ? `The page showed "${short(rec, 60)}" where "${exp}" was expected.` : `"${exp}" was expected, but nothing was found there.`;
  }

  // lists and counts of problems ("no violations expected")
  if (/toEqual\(expected\)/.test(m)) {
    const { strings, pairs, helps } = diffAdded(m);
    if (helps.length) {
      const rules = [...new Set(helps.map((h) => HELP_TO_RULE.find(([re]) => re.test(h))?.[1]).filter(Boolean))];
      const sentences = rules.map((r) => A11Y_RULES[r]);
      const other = helps.filter((h) => !HELP_TO_RULE.some(([re]) => re.test(h)));
      return `The automated accessibility scan found ${new Set(helps).size} kind${new Set(helps).size === 1 ? '' : 's'} of serious problem. ${[...sentences, ...[...new Set(other)].map((h) => `${h}.`)].slice(0, 4).join(' ')}`.trim();
    }
    const found = a11yFindings(strings);
    if (found.rules.length) {
      return `The accessibility scan found serious problems on ${list(found.pages)}. ${found.rules.slice(0, 4).map((r) => A11Y_RULES[r]).join(' ')}`.trim();
    }
    if (pairs.length && pairs.every(([, n]) => typeof n === 'number')) {
      const nonzero = pairs.filter(([, n]) => n !== 0);
      if (/-\s+"[^"]+":\s*0/.test(m) && nonzero.length) {
        return `None were expected, but problems were found on ${list(nonzero.map(([k, n]) => `${k} (${n})`), 6)}.`;
      }
      return `The measured values differ from the expected ones: ${list(pairs.map(([k, n]) => `${k} ${n}`), 6)}.`;
    }
    const THEMES = new Set(['normal', 'dark', 'contrast', 'forced-colors']);
    const byTheme = strings.map((x) => x.split('/')).filter((p) => p.length === 2 && THEMES.has(p[1]));
    if (byTheme.length && byTheme.length === strings.length) {
      const pages = new Map();
      for (const [pg, theme] of byTheme) pages.set(pg, [...(pages.get(pg) ?? []), theme]);
      return `The check failed on ${byTheme.length} page and theme combination${byTheme.length === 1 ? '' : 's'}: ${[...pages].map(([pg, t]) => `${pg} (${t.join(', ')})`).join('; ')}.`;
    }
    if (strings.length && /Expected\s+-\s*1[\s\S]*Array \[\]/.test(m)) {
      return `No problems were expected, but ${strings.length} ${strings.length === 1 ? 'was' : 'were'} found: ${list(strings.map((s) => short(s, 50)))}.`;
    }
    return 'The information shown does not match the expected information.';
  }

  // simple values
  const notBe = m.match(/not\.toBe\(expected\)[\s\S]*?Expected:\s*not\s*(.+)/);
  if (notBe) return unquote(notBe[1]) === '' ? 'A value that must not be empty was empty.' : `The value should not be ${short(unquote(notBe[1]))}, but it was.`;
  const be = m.match(/toBe\(expected\)[\s\S]*?Expected:\s*(.+)\n\s*Received:\s*(.+)/);
  if (be) return `Expected ${short(unquote(be[1]))}, but found ${short(unquote(be[2]))}.`;
  const greater = m.match(/toBeGreaterThan(?:OrEqual)?\(expected\)[\s\S]*?Expected:\s*>=?\s*(.+)\n\s*Received:\s*(.+)/);
  if (greater) return unquote(greater[2]) === '0' ? 'At least one was expected, but none were found.' : `Expected more than ${unquote(greater[1])}, but found ${unquote(greater[2])}.`;
  const less = m.match(/toBeLessThan(?:OrEqual)?\(expected\)[\s\S]*?Expected:\s*<=?\s*(.+)\n\s*Received:\s*(.+)/);
  if (less) return `Expected less than ${unquote(less[1])}, but measured ${unquote(less[2])}.`;
  if (/toBeTruthy\(\)|toBe\(true\)/.test(m)) return 'A condition that should have been true was not.';
  if (/toBeFalsy\(\)|toBe\(false\)/.test(m)) return 'A condition that should have been false was true.';

  // the page itself
  if (/ReferenceError|TypeError|is not defined/.test(m)) return 'The page raised a script error while it was being used.';
  if (/status(?: code)?:?\s*5\d\d|HTTP 5\d\d/i.test(m)) return 'The server returned an error while handling the request.';
  return null;
}

/** "How might this affect people?", from the defect's type (or the test's area when no defect). */
const IMPACT = {
  accessibility: 'People who use a keyboard, a screen reader, zoom or high-contrast settings may find this part of the application hard or impossible to use. It can also affect accessibility compliance.',
  functional: 'Users may not be able to complete this task, or may get a wrong result.',
  ui: 'The page may look broken or be harder to use, which affects trust and usability.',
  navigation: 'Users may have difficulty finding or reaching the pages they need.',
  performance: 'Users wait longer than they should, and some may give up before the page loads.',
  security: 'Information may be exposed or kept where it should not be, which is a privacy and security risk.',
  compatibility: 'Users on some browsers or devices may not get a working page.',
  validation: 'Wrong or incomplete information may be accepted, or correct information rejected.',
  integration: 'Information exchanged with another system may be missing or wrong.',
  api: 'Information exchanged with the server may be missing or wrong.',
};

export function businessImpact(type) {
  const key = String(type ?? '').trim().toLowerCase();
  return IMPACT[key] ?? null;
}

/** The issue type a test's area suggests, used only to pick an impact sentence when no defect says. */
export function areaOf(test, moduleName = '') {
  const text = `${test?.title ?? ''} ${test?.scenario ?? ''} ${test?.type ?? ''} ${moduleName}`.toLowerCase();
  if (/accessib|a11y|contrast|screen reader|keyboard|focus|heading|landmark|alt text|aria/.test(text)) return 'Accessibility';
  if (/load|slow|performance|speed/.test(text)) return 'Performance';
  if (/layout|responsive|viewport|zoom|mobile|tablet|scroll/.test(text)) return 'UI';
  if (/menu|navigat|link|breadcrumb/.test(text)) return 'Navigation';
  if (/storage|privacy|security|session/.test(text)) return 'Security';
  return null;
}

/**
 * The five parts every failure is shown with. `expected` is the plan's own wording (written for
 * people); `actual` prefers the defect's description of what happens, else the explained error.
 */
export function explainFailure({ test, failure, defect, moduleName }) {
  const reason = String(failure?.reason ?? '').trim();
  const message = String(failure?.message ?? '').trim();
  const technical = (message.startsWith(reason) ? message : [reason, message].filter(Boolean).join('\n\n')).trim() || null;
  const fromError = explainError(failure?.message ?? failure?.reason);
  const neutral = 'The automated check did not get the expected result.';
  const actual = defect?.actual && !/^(Error|TimeoutError|expect\()/.test(defect.actual) ? defect.actual : fromError ?? neutral;
  const simple = defect?.title
    ? `${fromError ?? neutral} This is the known issue "${defect.title}".`
    : fromError ?? neutral;
  const type = defect?.type || areaOf(test, moduleName);
  return {
    simple,
    expected: test?.expected || test?.expectedResult || defect?.expected || null,
    actual,
    impact: businessImpact(type),
    impactBasis: defect?.type ? 'defect type' : type ? 'test area' : null,
    technical,
  };
}

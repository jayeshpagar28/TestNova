#!/usr/bin/env node
/**
 * `npm run catalogue` (and predev/prebuild): rebuild every project's catalogue
 * (projects/<id>/catalogue.json, see server/catalogue.mjs). The default project's copy also goes to
 * web/src/data/catalogue.json, which only the offline share build reads (the live page fetches each
 * project's catalogue from the API).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from '../server/catalogue.mjs';
import { activeProjectId, ensureWorkspace, projectIds } from '../server/workspace.mjs';

const OFFLINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'src', 'data', 'catalogue.json');
const active = activeProjectId();
let offline = { generatedAt: new Date().toISOString(), source: 'spec-files', listError: null, modules: [] };

for (const pid of projectIds()) {
  ensureWorkspace(pid);
  const c = await buildCatalogue(pid);
  const total = c.modules.reduce((n, m) => n + m.tests.length, 0);
  console.log(`catalogue ${pid} (${c.source}): ${c.modules.length} modules, ${total} tests`);
  if (c.listError) console.warn(`playwright --list reported for ${pid}:\n${c.listError}`);
  if (pid === active) offline = c;
}
mkdirSync(dirname(OFFLINE), { recursive: true });
writeFileSync(OFFLINE, `${JSON.stringify(offline, null, 1)}\n`);

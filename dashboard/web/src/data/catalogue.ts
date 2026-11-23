/**
 * The test catalogue of the project on screen: GET /api/catalogue (server/catalogue.mjs builds one
 * per project and announces each rebuild). catalogue.json is only the offline share build's copy.
 * Typed here rather than inferred from the JSON, because a project with no modules yet would make
 * the inferred element type `never`.
 */
import { onServerEvent } from './events';
import { useEffect, useState } from 'react';
import raw from './catalogue.json';
import { forThisProject, withProject } from './projects';
import { viaTunnel } from './api';

export interface CatalogueTest {
  key: string;
  id: string;
  idGenerated: boolean;
  title: string;
  scenario: string;
  description: string;
  group: string;
  modifier: string | null;
  knownDefect: string | null;
  live: boolean;
  priority: string | null;
  expected: string | null;
  steps: string | null;
  /** From the test plan's readable columns (null when the plan has none). */
  planDescription?: string | null;
  testData?: string | null;
  created?: string | null;
  type?: string | null;
  ac?: string | null;
  preconditions?: string | null;
}

export interface CatalogueModule {
  id: string;
  order: number;
  name: string;
  icon: string;
  description?: string;
  spec: string | null;
  deviceStep: string | null;
  tests: CatalogueTest[];
}

export interface Catalogue {
  projectId?: string;
  generatedAt: string | null;
  source?: 'knowledge-base' | 'spec-files';
  listError?: string | null;
  modules: CatalogueModule[];
}

/** The offline share build's catalogue (no server to ask). */
export const offlineCatalogue = raw as unknown as Catalogue;

/**
 * This project's catalogue, fetched again whenever the server rebuilds it (the pipeline writing
 * specs or plans). `null` until the first answer; the offline copy if the server cannot be reached.
 */
export function useCatalogue(): Catalogue | null {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(withProject('/api/catalogue'))
        .then((r) => (r.ok ? (r.json() as Promise<Catalogue>) : Promise.reject(new Error(String(r.status)))))
        .then((c) => alive && setCatalogue(c))
        .catch(() => alive && setCatalogue((c) => c ?? offlineCatalogue));
    load();
    const poll = setInterval(load, 30_000);
    // the tab's one shared event stream (events.ts); "resync" after the tab was in the background
    const stop = viaTunnel() ? () => {} : onServerEvent((event) => {
      if ((event.type === 'catalogue' && forThisProject(event.projectId as string | undefined)) || event.type === 'resync') load();
    });
    return () => {
      alive = false;
      clearInterval(poll);
      stop();
    };
  }, []);
  return catalogue;
}

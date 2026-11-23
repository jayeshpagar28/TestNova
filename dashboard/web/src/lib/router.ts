import { useEffect, useState } from 'react';

/**
 * Hash routes: `#/`, `#/setup` (`#/setup/new`: a new project), `#/pipeline`, `#/modules/<id>` and `#/regression[/<id>]`. A hash survives the single-file
 * share build, which is opened from disk with no server to answer a real path.
 */
export type Route =
  | { page: 'dashboard' }
  | { page: 'setup'; fresh: boolean }
  | { page: 'pipeline' }
  | { page: 'module'; id: string }
  | { page: 'regression'; id: string | null }
  | { page: 'report'; tab: ReportTab; params: URLSearchParams };

/** The QA report: `#/report`, `#/report/defects?module=<id>&status=open`, `#/report/failed?module=<id>`, … */
export type ReportTab = 'overview' | 'defects' | 'failed' | 'accessibility' | 'validation';
const REPORT_TABS: ReportTab[] = ['overview', 'defects', 'failed', 'accessibility', 'validation'];

function parse(): Route {
  const report = location.hash.match(/^#\/report(?:\/(\w+))?(?:\?(.*))?$/);
  if (report) {
    const tab = REPORT_TABS.includes(report[1] as ReportTab) ? (report[1] as ReportTab) : 'overview';
    return { page: 'report', tab, params: new URLSearchParams(report[2] ?? '') };
  }
  if (location.hash === '#/setup/new') return { page: 'setup', fresh: true };
  if (location.hash === '#/setup' || location.hash.startsWith('#/setup/')) return { page: 'setup', fresh: false };
  if (location.hash === '#/pipeline' || location.hash.startsWith('#/pipeline/')) return { page: 'pipeline' };
  const id = location.hash.match(/^#\/modules\/([\w-]+)/)?.[1];
  if (id) return { page: 'module', id };
  const regression = location.hash.match(/^#\/regression(?:\/(RG-[\w-]+))?/);
  if (regression) return { page: 'regression', id: regression[1] ?? null };
  return { page: 'dashboard' };
}

export const goDashboard = () => {
  location.hash = '#/';
};
export const goSetup = () => {
  location.hash = '#/setup';
};
/** The Setup screen with an empty form: a new project, independent of the existing ones. */
export const goNewProject = () => {
  location.hash = '#/setup/new';
};
export const goPipeline = () => {
  location.hash = '#/pipeline';
};
export const goModule = (id: string) => {
  location.hash = `#/modules/${id}`;
};
/** No id: the regression running now, else the newest. */
export const goRegression = (id?: string) => {
  location.hash = id ? `#/regression/${id}` : '#/regression';
};

/** The QA report, optionally on a tab with filters: goReport('defects', { module: 'circulars', status: 'open' }). */
export const goReport = (tab: ReportTab = 'overview', params: Record<string, string> = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  location.hash = `#/report${tab === 'overview' ? '' : `/${tab}`}${q ? `?${q}` : ''}`;
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const change = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return route;
}

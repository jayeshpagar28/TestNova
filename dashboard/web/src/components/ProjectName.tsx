import { currentProjectId, useProjects } from '../data/projects';

/** " · <project name>": appended to a page title, so every page says which project it shows. */
export function ProjectName() {
  const { projects } = useProjects();
  const name = projects?.find((p) => p.id === currentProjectId())?.name;
  return name ? <span className="text-ink-3"> · {name}</span> : null;
}

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthGate } from './components/AuthGate';
import { applyTheme } from './lib/theme';
import { settleProject, useCurrentProjectId } from './data/projects';

applyTheme();

/**
 * The app for one project at a time. Keyed by the project id: switching project remounts it, so
 * every page loads the new project's data from scratch and nothing of the previous one lingers.
 */
function Root() {
  const [ready, setReady] = useState(false);
  const project = useCurrentProjectId();
  useEffect(() => {
    settleProject().finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <App key={project ?? 'none'} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <Root />
    </AuthGate>
  </StrictMode>,
);

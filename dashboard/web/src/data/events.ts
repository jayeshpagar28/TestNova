/**
 * The server's event stream (/api/events), shared: one connection per browser tab, whatever number
 * of components listen.
 *
 * Why: a browser allows only 6 open connections per address. Each event stream holds one open for
 * good, so three streams per tab meant two dashboard tabs used all six, and every other request of
 * the page queued forever (the page "kept loading"). The stream is also closed while the tab is in
 * the background and reopened when it is shown again; listeners then get a { type: 'resync' }
 * event, so they re-read anything they may have missed.
 */
export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}
type Listener = (event: ServerEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let hiddenAt: number | null = null;

const emit = (event: ServerEvent) => {
  for (const fn of [...listeners]) {
    try {
      fn(event);
    } catch {
      // one listener's error must not stop the others
    }
  }
};

function open() {
  if (source || !listeners.size || typeof EventSource === 'undefined') return;
  try {
    source = new EventSource('/api/events');
    source.onmessage = (e) => {
      try {
        emit(JSON.parse(e.data) as ServerEvent);
      } catch {
        // not JSON: ignore
      }
    };
  } catch {
    source = null; // opened from a file: nothing to listen to
  }
}

function close() {
  source?.close();
  source = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      close();
    } else if (hiddenAt !== null) {
      hiddenAt = null;
      open();
      emit({ type: 'resync' });
    }
  });
}

/** Listen to every server event; returns the function that stops listening. */
export function onServerEvent(fn: Listener): () => void {
  listeners.add(fn);
  if (typeof document === 'undefined' || !document.hidden) open();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) close();
  };
}

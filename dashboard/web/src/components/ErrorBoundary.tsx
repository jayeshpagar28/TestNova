import { Component, type ReactNode } from 'react';

/**
 * A rendering error in one page shows a message here instead of blanking the whole dashboard.
 * Runs in the browser are not affected by a page error; they are owned by the server.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    // moving to another page clears the error
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-16 max-w-[520px] rounded-[22px] border border-line-2 bg-card p-8 text-center">
        <p className="text-[16px] text-ink">This page hit a problem and could not be shown.</p>
        <p className="mt-2 text-[12.5px] text-ink-2">Any execution in progress carries on; it is run by the TestNova server, not this page.</p>
        <p className="mt-3 break-words text-[12px] text-ink-3">{this.state.error.message}</p>
        <button onClick={() => location.reload()} className="mt-5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-[#111]">
          Reload the page
        </button>
      </div>
    );
  }
}

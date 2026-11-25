import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected runtime failure',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[nexus-v4-minimal] Uncaught renderer error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#090a0c] p-6 text-zinc-100">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#0e1014] p-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              Nexus V4 Runtime Boundary
            </div>
            <p className="mb-4 font-mono text-xs leading-relaxed text-zinc-300">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/10"
            >
              Reload Surface
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);

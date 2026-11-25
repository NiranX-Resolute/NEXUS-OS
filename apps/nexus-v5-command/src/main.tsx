import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class MatrixErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMsg: msg };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#05080b] text-emerald-100 flex items-center justify-center p-6 font-mono">
          <div className="max-w-xl w-full rounded-2xl border border-red-500/35 bg-[#090f16] p-6 shadow-[0_0_32px_rgba(239,68,68,0.18)]">
            <div className="text-xs uppercase tracking-[0.22em] text-red-400 mb-2">
              Nexus V5 // Cyber Matrix Fault Boundary
            </div>
            <h1 className="text-lg font-semibold text-white mb-3">
              Renderer Exception Intercepted
            </h1>
            <pre className="text-xs text-red-300 bg-black/50 border border-red-500/20 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
              {this.state.errorMsg}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <MatrixErrorBoundary>
        <App />
      </MatrixErrorBoundary>
    </StrictMode>
  );
}

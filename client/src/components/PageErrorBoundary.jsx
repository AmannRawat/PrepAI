import React from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Page render error caught by PageErrorBoundary:', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // Automatically reset error state when user navigates to another page
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center max-w-md mx-auto animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-4">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-text-primary mb-2">
            Something went wrong loading this page
          </h2>
          <p className="text-xs text-text-secondary mb-6 leading-relaxed">
            We encountered an unexpected issue while loading this section. Your session and saved data are safe.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-border text-xs font-semibold text-text-primary transition shadow-xs cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Try Again</span>
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition shadow-sm cursor-pointer"
            >
              <Home size={13} />
              <span>Return to Dashboard</span>
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default PageErrorBoundary;


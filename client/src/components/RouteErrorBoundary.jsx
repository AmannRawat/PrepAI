import { useRouteError, useNavigate } from 'react-router-dom';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export const RouteErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  console.error('Route error caught by RouteErrorBoundary:', error);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center max-w-md mx-auto animate-fade-in">
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
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-border text-xs font-semibold text-text-primary transition shadow-xs cursor-pointer"
        >
          <RotateCcw size={13} />
          <span>Reload Page</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition shadow-sm cursor-pointer"
        >
          <Home size={13} />
          <span>Return to Dashboard</span>
        </button>
      </div>
    </div>
  );
};

export default RouteErrorBoundary;


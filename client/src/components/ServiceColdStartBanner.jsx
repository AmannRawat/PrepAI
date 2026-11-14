import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { useServiceAvailability } from '../context/ServiceAvailabilityContext';
import {
  AVAILABILITY_STATE,
  SERVICE_STATUS,
  RECRUITER_MESSAGES,
} from '../utils/serviceAvailability';

export const ServiceColdStartBanner = () => {
  const {
    availabilityState,
    isChecking,
    isConnecting,
    isUnavailable,
    isPaused,
    nodeStatus,
    aiStatus,
    isNodeAvailable,
    isAiAvailable,
    isNodeStarting,
    isAiStarting,
    retryCount,
    maxRetries,
    showRecoveryNotice,
    manualRetry,
  } = useServiceAvailability();

  const isBothStarting = isNodeStarting && isAiStarting;
  const isNodeOnlyStarting = isNodeStarting && !isAiStarting;
  const isAiOnlyStarting = !isNodeStarting && isAiStarting;
  const isRetriesExhausted =
    isUnavailable ||
    isPaused ||
    availabilityState === AVAILABILITY_STATE.UNAVAILABLE ||
    availabilityState === AVAILABILITY_STATE.PAUSED;

  // The banner is visible when a service is actively starting/reconnecting/paused/unavailable, or during recovery
  // It remains strictly hidden on initial app load when services are already awake (preventing flashing)
  const isServiceDegraded =
    isNodeStarting ||
    isAiStarting ||
    isConnecting ||
    isUnavailable ||
    isPaused;

  const isVisible =
    (isServiceDegraded && availabilityState !== AVAILABILITY_STATE.AVAILABLE && availabilityState !== AVAILABILITY_STATE.IDLE) ||
    showRecoveryNotice;

  if (!isVisible) {
    return null;
  }

  // Determine title and description according to specifications
  let title = '';
  let message = '';
  let Icon = Server;
  let accentColor = 'amber';

  if (showRecoveryNotice) {
    title = 'Services Ready';
    message = 'Connection established! All demo services are active and ready.';
    Icon = CheckCircle2;
    accentColor = 'emerald';
  } else if (availabilityState === AVAILABILITY_STATE.UNAVAILABLE || isUnavailable) {
    if (isAiOnlyStarting) {
      title = 'AI services are currently unavailable';
      message = 'The application server is ready, but AI processing is taking longer than expected. Please try reconnecting.';
      Icon = Sparkles;
      accentColor = 'blue';
    } else {
      title = RECRUITER_MESSAGES.UNAVAILABLE_TITLE;
      message = RECRUITER_MESSAGES.UNAVAILABLE_MSG;
      Icon = Server;
      accentColor = 'amber';
    }
  } else if (isBothStarting) {
    title = RECRUITER_MESSAGES.BOTH_STARTING_TITLE;
    message = RECRUITER_MESSAGES.BOTH_STARTING_MSG;
    Icon = Layers;
    accentColor = 'amber';
  } else if (isNodeOnlyStarting) {
    title = RECRUITER_MESSAGES.NODE_STARTING_TITLE;
    message = RECRUITER_MESSAGES.NODE_STARTING_MSG;
    Icon = Server;
    accentColor = 'amber';
  } else if (isAiOnlyStarting) {
    title = RECRUITER_MESSAGES.AI_STARTING_TITLE;
    message = RECRUITER_MESSAGES.AI_STARTING_MSG;
    Icon = Sparkles;
    accentColor = 'blue';
  } else {
    title = RECRUITER_MESSAGES.NODE_STARTING_TITLE;
    message = RECRUITER_MESSAGES.NODE_STARTING_MSG;
  }

  // Authoritative status badge projection
  const getBadgeText = () => {
    if (showRecoveryNotice) return 'Ready';
    if (availabilityState === AVAILABILITY_STATE.UNAVAILABLE || isUnavailable) return 'Unavailable';
    if (availabilityState === AVAILABILITY_STATE.PAUSED || isPaused) return 'Paused';
    if (availabilityState === AVAILABILITY_STATE.CHECKING) return 'Checking...';
    if (availabilityState === AVAILABILITY_STATE.CONNECTING) {
      return retryCount > 0 ? `Connecting (${retryCount}/${maxRetries})` : 'Connecting...';
    }
    return 'Starting';
  };

  // Authoritative retry button label and state
  const getButtonLabel = () => {
    if (isChecking) return 'Checking...';
    if (isRetriesExhausted) return 'Retry Connection';
    return 'Retry Now';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
        className="w-full px-4 sm:px-6 pt-3 pb-1 shrink-0 z-40"
      >
        <div
          role="status"
          aria-live="polite"
          className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-lg backdrop-blur-md transition-colors ${
            showRecoveryNotice
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
              : accentColor === 'blue'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-blue-100'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100'
          }`}
        >
          {/* Subtle animated top shimmer when actively checking */}
          {isChecking && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-40 animate-pulse" />
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 sm:mt-0 ${
                  showRecoveryNotice
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : accentColor === 'blue'
                    ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}
              >
                <Icon
                  size={18}
                  className={isChecking ? 'animate-spin' : ''}
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold tracking-tight">
                    {title}
                  </h4>
                  {/* Status Badge */}
                  {!showRecoveryNotice && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface/50 border border-border/50 text-text-secondary">
                      <Clock size={10} className={isChecking ? 'animate-spin' : ''} />
                      {getBadgeText()}
                    </span>
                  )}
                </div>

                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed max-w-2xl">
                  {message}
                </p>

                {/* Multi-service breakdown when both or AI starting */}
                {!showRecoveryNotice && (isBothStarting || isAiOnlyStarting) && (
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                    <span className="text-text-tertiary">Service status:</span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                        isNodeAvailable
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      Application Server:{' '}
                      {isNodeAvailable ? 'Ready' : 'Starting'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                        isAiAvailable
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      AI Processing:{' '}
                      {isAiAvailable ? 'Ready' : 'Starting'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons: Manual retry */}
            {!showRecoveryNotice && (
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={manualRetry}
                  disabled={isChecking}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                    isRetriesExhausted
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold ring-2 ring-emerald-500/30'
                      : 'bg-surface hover:bg-surface-elevated border border-border text-text-primary'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Retry connection to demo servers"
                >
                  <RefreshCw
                    size={12}
                    className={isChecking ? 'animate-spin' : ''}
                  />
                  <span>{getButtonLabel()}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

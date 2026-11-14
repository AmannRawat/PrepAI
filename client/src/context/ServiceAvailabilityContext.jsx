import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  AVAILABILITY_STATE,
  SERVICE_STATUS,
  getApiBaseUrl,
  probeServiceHealth,
  calculateBackoffDelay,
  isColdStartError,
  isAiEndpoint,
  logAvailabilityDiagnostic,
} from '../utils/serviceAvailability.js';
import { registerAvailabilityCallbacks } from '../utils/api.js';

const ServiceAvailabilityContext = createContext(null);

export const MAX_RECONNECT_RETRIES = 5;

export const ServiceAvailabilityProvider = ({ children }) => {
  // Authoritative State Machine
  const [availabilityState, setAvailabilityState] = useState(AVAILABILITY_STATE.IDLE);
  const [nodeStatus, setNodeStatus] = useState(SERVICE_STATUS.UNKNOWN);
  const [aiStatus, setAiStatus] = useState(SERVICE_STATUS.UNKNOWN);
  const [retryCount, setRetryCount] = useState(0);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);

  // Mutable refs to prevent render loops, stale closures, and race conditions
  const stateRef = useRef(AVAILABILITY_STATE.IDLE);
  const nodeStatusRef = useRef(SERVICE_STATUS.UNKNOWN);
  const aiStatusRef = useRef(SERVICE_STATUS.UNKNOWN);
  const attemptRef = useRef(0);
  const activeTimerRef = useRef(null);
  const activeAbortRef = useRef(null);
  const isMountedRef = useRef(true);
  const isProbingRef = useRef(false);
  const prevWasStartingRef = useRef(false);

  // Synchronize stateRef with current state
  const updateAvailabilityState = useCallback((newState) => {
    stateRef.current = newState;
    if (isMountedRef.current) {
      setAvailabilityState(newState);
    }
  }, []);

  const clearScheduledTimer = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
  }, []);

  const abortInFlight = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    isProbingRef.current = false;
  }, []);

  /**
   * Authoritative probe execution function.
   * Completely isolated from reactive state to prevent effect re-trigger loops.
   */
  const executeProbe = useCallback(
    async ({
      isManual = false,
      targetAttempt = null,
      preserveAttempt = false,
      isInitialMount = false,
    } = {}) => {
      const probeId = `probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      clearScheduledTimer();

      if (isManual) {
        logAvailabilityDiagnostic('Manual retry triggered', { probeId });
        abortInFlight();
        attemptRef.current = 1;
        setRetryCount(1);
        prevWasStartingRef.current = false;
        updateAvailabilityState(AVAILABILITY_STATE.CONNECTING);
      } else if (isInitialMount) {
        logAvailabilityDiagnostic('Initial mount probe initialized', { probeId });
        abortInFlight();
        attemptRef.current = 1;
        setRetryCount(1);
      } else if (preserveAttempt) {
        logAvailabilityDiagnostic('Preserve attempt probe triggered', { probeId, attempt: attemptRef.current });
        setRetryCount(attemptRef.current);
      } else if (typeof targetAttempt === 'number') {
        attemptRef.current = targetAttempt;
        setRetryCount(targetAttempt);
      } else if (attemptRef.current === 0) {
        attemptRef.current = 1;
        setRetryCount(1);
      }

      logAvailabilityDiagnostic('Attempt counter updated', {
        probeId,
        attempt: attemptRef.current,
        maxRetries: MAX_RECONNECT_RETRIES,
      });

      // Prevent overlapping probe calls unless caller is a manual retry or fresh initial mount
      if (isProbingRef.current && !isManual && !isInitialMount) {
        logAvailabilityDiagnostic('Probe execution skipped: already in flight', { probeId });
        return;
      }

      isProbingRef.current = true;
      updateAvailabilityState(AVAILABILITY_STATE.CHECKING);

      const controller = new AbortController();
      activeAbortRef.current = controller;

      try {
        logAvailabilityDiagnostic('Initial probe started', { probeId, attempt: attemptRef.current });

        const result = await probeServiceHealth(
          getApiBaseUrl(),
          controller.signal,
          5000,
          probeId
        );

        if (!isMountedRef.current) {
          logAvailabilityDiagnostic('Probe completed but component unmounted', { probeId });
          return;
        }

        // If aborted specifically by a caller (e.g. superseding probe), ignore result
        if (result.isAborted || controller.signal.aborted) {
          logAvailabilityDiagnostic('Caller aborted request acknowledged', { probeId });
          return;
        }

        nodeStatusRef.current = result.node;
        aiStatusRef.current = result.ai;
        setNodeStatus(result.node);
        setAiStatus(result.ai);

        const isNodeUp = result.node === SERVICE_STATUS.AVAILABLE;
        const isAiUp = result.ai === SERVICE_STATUS.AVAILABLE;

        if (isNodeUp && isAiUp) {
          logAvailabilityDiagnostic('Services available: both Node & AI online', { probeId });
          updateAvailabilityState(AVAILABILITY_STATE.AVAILABLE);
          attemptRef.current = 0;
          setRetryCount(0);

          if (prevWasStartingRef.current) {
            setShowRecoveryNotice(true);
            setTimeout(() => {
              if (isMountedRef.current) {
                setShowRecoveryNotice(false);
              }
            }, 2500);
          }
          prevWasStartingRef.current = false;
          return;
        }

        // At least one service is still starting / unavailable
        prevWasStartingRef.current = true;

        // If this was a background tab probe that failed, stay in current state (e.g. UNAVAILABLE) without resetting attempts
        if (preserveAttempt) {
          updateAvailabilityState(stateRef.current);
          return;
        }

        if (attemptRef.current >= MAX_RECONNECT_RETRIES) {
          logAvailabilityDiagnostic('Maximum retries reached', {
            probeId,
            attempts: attemptRef.current,
            maxRetries: MAX_RECONNECT_RETRIES,
          });
          logAvailabilityDiagnostic('Service transitioned to UNAVAILABLE', {
            probeId,
            attempts: attemptRef.current,
          });
          updateAvailabilityState(AVAILABILITY_STATE.UNAVAILABLE);
          return;
        }

        // Transition to CONNECTING and schedule next backoff attempt
        updateAvailabilityState(AVAILABILITY_STATE.CONNECTING);
        const nextAttempt = attemptRef.current + 1;
        const delay = calculateBackoffDelay(nextAttempt, 2000, 1.5, 8000);

        logAvailabilityDiagnostic('Retry timer scheduled', {
          probeId,
          nextAttempt,
          delayMs: delay,
        });

        activeTimerRef.current = setTimeout(() => {
          logAvailabilityDiagnostic('Retry timer executed', { nextAttempt });
          if (isMountedRef.current) {
            executeProbe({ isManual: false, targetAttempt: nextAttempt });
          }
        }, delay);
      } catch (err) {
        logAvailabilityDiagnostic('Probe execution encountered error', {
          probeId,
          error: err?.message || String(err),
        });

        if (!isMountedRef.current) return;
        nodeStatusRef.current = SERVICE_STATUS.STARTING;
        setNodeStatus(SERVICE_STATUS.STARTING);

        if (preserveAttempt) {
          updateAvailabilityState(stateRef.current);
        } else if (attemptRef.current >= MAX_RECONNECT_RETRIES) {
          logAvailabilityDiagnostic('Maximum retries reached in catch', {
            probeId,
            attempts: attemptRef.current,
          });
          logAvailabilityDiagnostic('Service transitioned to UNAVAILABLE', {
            probeId,
            attempts: attemptRef.current,
          });
          updateAvailabilityState(AVAILABILITY_STATE.UNAVAILABLE);
        } else {
          updateAvailabilityState(AVAILABILITY_STATE.CONNECTING);
          const nextAttempt = attemptRef.current + 1;
          const delay = calculateBackoffDelay(nextAttempt, 2000, 1.5, 8000);

          logAvailabilityDiagnostic('Retry timer scheduled from catch', {
            probeId,
            nextAttempt,
            delayMs: delay,
          });

          activeTimerRef.current = setTimeout(() => {
            logAvailabilityDiagnostic('Retry timer executed', { nextAttempt });
            if (isMountedRef.current) {
              executeProbe({ isManual: false, targetAttempt: nextAttempt });
            }
          }, delay);
        }
      } finally {
        isProbingRef.current = false;
        if (activeAbortRef.current === controller) {
          activeAbortRef.current = null;
        }
      }
    },
    [clearScheduledTimer, abortInFlight, updateAvailabilityState]
  );

  /**
   * User-triggered manual retry handler.
   */
  const manualRetry = useCallback(() => {
    executeProbe({ isManual: true });
  }, [executeProbe]);

  /**
   * Interceptor callback invoked whenever an Axios network request succeeds.
   */
  const handleNetworkSuccess = useCallback((config) => {
    const url = config?.url || '';

    // Node is confirmed responsive
    if (nodeStatusRef.current !== SERVICE_STATUS.AVAILABLE) {
      nodeStatusRef.current = SERVICE_STATUS.AVAILABLE;
      setNodeStatus(SERVICE_STATUS.AVAILABLE);
    }

    // If an AI-specific endpoint succeeded, AI is also responsive
    if (isAiEndpoint(url)) {
      if (aiStatusRef.current !== SERVICE_STATUS.AVAILABLE) {
        aiStatusRef.current = SERVICE_STATUS.AVAILABLE;
        setAiStatus(SERVICE_STATUS.AVAILABLE);
      }
    }

    // If both services are now available and we were not marked AVAILABLE, resolve state
    if (
      nodeStatusRef.current === SERVICE_STATUS.AVAILABLE &&
      (aiStatusRef.current === SERVICE_STATUS.AVAILABLE || !isAiEndpoint(url))
    ) {
      if (stateRef.current !== AVAILABILITY_STATE.AVAILABLE) {
        clearScheduledTimer();
        updateAvailabilityState(AVAILABILITY_STATE.AVAILABLE);
        attemptRef.current = 0;
        setRetryCount(0);

        if (prevWasStartingRef.current) {
          setShowRecoveryNotice(true);
          setTimeout(() => {
            if (isMountedRef.current) {
              setShowRecoveryNotice(false);
            }
          }, 2500);
        }
        prevWasStartingRef.current = false;
      }
    }
  }, [clearScheduledTimer, updateAvailabilityState]);

  /**
   * Interceptor callback invoked whenever an Axios request encounters a cold start or transport error.
   */
  const handleNetworkFailure = useCallback((error, config) => {
    if (!isColdStartError(error)) return;

    const url = config?.url || '';
    const isAi = isAiEndpoint(url);

    if (isAi) {
      aiStatusRef.current = SERVICE_STATUS.STARTING;
      setAiStatus(SERVICE_STATUS.STARTING);
    } else {
      nodeStatusRef.current = SERVICE_STATUS.STARTING;
      setNodeStatus(SERVICE_STATUS.STARTING);
    }

    prevWasStartingRef.current = true;

    // If we were AVAILABLE or IDLE, initiate a probe cycle
    // (If already CHECKING or CONNECTING, let the active cycle manage attempts to prevent counter inflation)
    if (
      stateRef.current === AVAILABILITY_STATE.AVAILABLE ||
      stateRef.current === AVAILABILITY_STATE.IDLE
    ) {
      executeProbe({ isManual: false, targetAttempt: 1 });
    }
  }, [executeProbe]);

  // Stable lifecycle: mounts ONCE, sets up interceptors, executes initial probe, cleans up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    logAvailabilityDiagnostic('Provider initialized', { state: stateRef.current });

    const unregister = registerAvailabilityCallbacks({
      onSuccess: handleNetworkSuccess,
      onFailure: handleNetworkFailure,
    });

    // Execute initial probe on application start - always starts fresh
    logAvailabilityDiagnostic('Initial probe triggered on mount', { isMounted: isMountedRef.current });
    executeProbe({ isManual: false, targetAttempt: 1, isInitialMount: true });

    return () => {
      isMountedRef.current = false;
      logAvailabilityDiagnostic('Provider unmounted / cleanup', {});
      unregister();
      clearScheduledTimer();
      abortInFlight();
    };
  }, []); // Strictly empty dependency array - prevents infinite re-render loops!

  // Handle tab visibility change safely: recheck connectivity when tab becomes visible
  // without resetting active retry cycle or starting duplicate health checks.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        if (
          stateRef.current !== AVAILABILITY_STATE.AVAILABLE &&
          !isProbingRef.current
        ) {
          if (
            stateRef.current === AVAILABILITY_STATE.UNAVAILABLE ||
            stateRef.current === AVAILABILITY_STATE.PAUSED
          ) {
            executeProbe({ isManual: false, preserveAttempt: true });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [executeProbe]);

  // Derived properties from authoritative state machine
  const isChecking = availabilityState === AVAILABILITY_STATE.CHECKING;
  const isConnecting = availabilityState === AVAILABILITY_STATE.CONNECTING;
  const isUnavailable = availabilityState === AVAILABILITY_STATE.UNAVAILABLE;
  const isPaused = availabilityState === AVAILABILITY_STATE.PAUSED;
  const isAvailable = availabilityState === AVAILABILITY_STATE.AVAILABLE;
  const retriesExhausted = isUnavailable || isPaused;

  const isNodeAvailable = nodeStatus === SERVICE_STATUS.AVAILABLE;
  const isAiAvailable = aiStatus === SERVICE_STATUS.AVAILABLE;
  const isNodeStarting = nodeStatus === SERVICE_STATUS.STARTING || nodeStatus === SERVICE_STATUS.UNAVAILABLE;
  const isAiStarting = aiStatus === SERVICE_STATUS.STARTING || aiStatus === SERVICE_STATUS.UNAVAILABLE;

  const value = {
    // Authoritative state machine
    availabilityState,
    isChecking,
    isConnecting,
    isUnavailable,
    isPaused,
    isAvailable,

    // Individual service status
    nodeStatus,
    aiStatus,
    isNodeAvailable,
    isAiAvailable,
    isNodeStarting,
    isAiStarting,

    // Attempt tracking
    retryCount,
    maxRetries: MAX_RECONNECT_RETRIES,
    retriesExhausted,

    // UI flags & controls
    showRecoveryNotice,
    manualRetry,
    checkHealth: () => executeProbe({ isManual: true }),
    reportSuccess: handleNetworkSuccess,
    reportRequestFailure: handleNetworkFailure,
  };

  return (
    <ServiceAvailabilityContext.Provider value={value}>
      {children}
    </ServiceAvailabilityContext.Provider>
  );
};

export const useServiceAvailability = () => {
  const context = useContext(ServiceAvailabilityContext);
  if (!context) {
    throw new Error(
      'useServiceAvailability must be used within a ServiceAvailabilityProvider'
    );
  }
  return context;
};

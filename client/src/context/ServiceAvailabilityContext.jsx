import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  SERVICE_STATUS,
  probeServiceHealth,
  calculateBackoffDelay,
  isColdStartError,
  isAiEndpoint,
} from '../utils/serviceAvailability.js';
import { registerAvailabilityCallbacks } from '../utils/api.js';

const ServiceAvailabilityContext = createContext(null);

export const MAX_RECONNECT_RETRIES = 5;

export const ServiceAvailabilityProvider = ({ children }) => {
  const [nodeStatus, setNodeStatus] = useState(SERVICE_STATUS.UNKNOWN);
  const [aiStatus, setAiStatus] = useState(SERVICE_STATUS.UNKNOWN);
  const [isChecking, setIsChecking] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retriesExhausted, setRetriesExhausted] = useState(false);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);

  // References to manage timers and active abort controllers cleanly
  const activeTimerRef = useRef(null);
  const activeAbortRef = useRef(null);
  const isMountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const prevStartingRef = useRef(false);

  // Synchronize ref with state
  useEffect(() => {
    retryCountRef.current = retryCount;
  }, [retryCount]);

  /**
   * Clears any scheduled retry timer.
   */
  const clearScheduledTimer = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
  }, []);

  /**
   * Aborts any in-flight health check probe.
   */
  const abortInFlight = useCallback(() => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
  }, []);

  /**
   * Core probe and state evaluation routine.
   */
  const executeHealthProbe = useCallback(
    async (isManual = false) => {
      clearScheduledTimer();
      abortInFlight();

      const controller = new AbortController();
      activeAbortRef.current = controller;

      if (isMountedRef.current) {
        setIsChecking(true);
      }

      try {
        const result = await probeServiceHealth(
          import.meta.env.VITE_API_URL,
          controller.signal,
          8000
        );

        if (!isMountedRef.current) return;

        const isNodeUp = result.node === SERVICE_STATUS.AVAILABLE;
        const isAiUp = result.ai === SERVICE_STATUS.AVAILABLE;
        const wasPreviouslyStarting =
          prevStartingRef.current ||
          nodeStatus === SERVICE_STATUS.STARTING ||
          aiStatus === SERVICE_STATUS.STARTING;

        setNodeStatus(result.node);
        setAiStatus(result.ai);

        if (isNodeUp && isAiUp) {
          // Both services available!
          setIsRetrying(false);
          setRetriesExhausted(false);
          setRetryCount(0);
          retryCountRef.current = 0;

          if (wasPreviouslyStarting) {
            setShowRecoveryNotice(true);
            setTimeout(() => {
              if (isMountedRef.current) {
                setShowRecoveryNotice(false);
              }
            }, 2500);
          }
          prevStartingRef.current = false;
          return;
        }

        // At least one service is still waking up / starting
        prevStartingRef.current = true;
        const currentAttempt = isManual ? 1 : retryCountRef.current + 1;

        if (currentAttempt > MAX_RECONNECT_RETRIES) {
          setIsRetrying(false);
          setRetriesExhausted(true);
          return;
        }

        setRetryCount(currentAttempt);
        setIsRetrying(true);
        setRetriesExhausted(false);

        // Schedule next check with bounded exponential backoff
        const delay = calculateBackoffDelay(currentAttempt);
        activeTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            executeHealthProbe(false);
          }
        }, delay);
      } catch {
        if (!isMountedRef.current) return;
        setNodeStatus(SERVICE_STATUS.STARTING);
      } finally {
        if (isMountedRef.current) {
          setIsChecking(false);
        }
      }
    },
    [clearScheduledTimer, abortInFlight, nodeStatus, aiStatus]
  );

  /**
   * Manual retry triggered by user click.
   */
  const manualRetry = useCallback(() => {
    setRetriesExhausted(false);
    setRetryCount(0);
    retryCountRef.current = 0;
    executeHealthProbe(true);
  }, [executeHealthProbe]);

  /**
   * Interceptor callback invoked whenever an Axios network request succeeds.
   */
  const reportSuccess = useCallback(
    (config) => {
      const url = config?.url || '';
      // Node is definitely available if any request returned successfully
      setNodeStatus((prev) => {
        if (prev !== SERVICE_STATUS.AVAILABLE) {
          if (prev === SERVICE_STATUS.STARTING) {
            setShowRecoveryNotice(true);
            setTimeout(() => {
              if (isMountedRef.current) setShowRecoveryNotice(false);
            }, 2500);
          }
          return SERVICE_STATUS.AVAILABLE;
        }
        return prev;
      });

      // If an AI-specific endpoint succeeded, AI is also available
      if (isAiEndpoint(url)) {
        setAiStatus(SERVICE_STATUS.AVAILABLE);
      }
    },
    []
  );

  /**
   * Interceptor callback invoked whenever an Axios request encounters a cold start or transport error.
   */
  const reportRequestFailure = useCallback(
    (error, config) => {
      if (!isColdStartError(error)) return;

      const url = config?.url || '';
      const isAi = isAiEndpoint(url);

      if (isAi) {
        // AI endpoint failed: mark AI service as starting
        setAiStatus(SERVICE_STATUS.STARTING);
      } else {
        // General Node endpoint failed: mark Node server as starting
        setNodeStatus(SERVICE_STATUS.STARTING);
      }

      prevStartingRef.current = true;

      // Start controlled health probe if not already retrying
      if (!activeTimerRef.current && !isChecking) {
        const nextAttempt = retryCountRef.current + 1;
        if (nextAttempt <= MAX_RECONNECT_RETRIES) {
          setRetryCount(nextAttempt);
          setIsRetrying(true);
          const delay = calculateBackoffDelay(nextAttempt);
          clearScheduledTimer();
          activeTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              executeHealthProbe(false);
            }
          }, delay);
        } else {
          setRetriesExhausted(true);
        }
      }
    },
    [isChecking, clearScheduledTimer, executeHealthProbe]
  );

  // Probe service health once on mount to determine initial status
  useEffect(() => {
    isMountedRef.current = true;
    const unregister = registerAvailabilityCallbacks({
      onSuccess: reportSuccess,
      onFailure: reportRequestFailure,
    });
    executeHealthProbe(false);

    return () => {
      isMountedRef.current = false;
      unregister();
      clearScheduledTimer();
      abortInFlight();
    };
  }, [reportSuccess, reportRequestFailure, executeHealthProbe, clearScheduledTimer, abortInFlight]);

  const value = {
    nodeStatus,
    aiStatus,
    isNodeAvailable: nodeStatus === SERVICE_STATUS.AVAILABLE,
    isAiAvailable: aiStatus === SERVICE_STATUS.AVAILABLE,
    isNodeStarting: nodeStatus === SERVICE_STATUS.STARTING,
    isAiStarting: aiStatus === SERVICE_STATUS.STARTING,
    isChecking,
    isRetrying,
    retryCount,
    maxRetries: MAX_RECONNECT_RETRIES,
    retriesExhausted,
    showRecoveryNotice,
    manualRetry,
    checkHealth: executeHealthProbe,
    reportSuccess,
    reportRequestFailure,
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

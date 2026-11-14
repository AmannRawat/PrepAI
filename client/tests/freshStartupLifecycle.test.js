import assert from 'node:assert/strict';
import {
  AVAILABILITY_STATE,
  SERVICE_STATUS,
  RECRUITER_MESSAGES,
  calculateBackoffDelay,
  probeServiceHealth,
} from '../src/utils/serviceAvailability.js';

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(` [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(` [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(` [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('======================================================');
console.log('  FRESH STARTUP & MULTI-SCENARIO AVAILABILITY LIFECYCLE ');
console.log('======================================================\n');

/**
 * Headless state machine simulator matching ServiceAvailabilityContext implementation.
 * Exercises exact React StrictMode mount/unmount/remount, in-flight abort handling,
 * bounded retries, and backoff progression.
 */
class AvailabilityStateMachineSimulator {
  constructor({ maxRetries = 5, onStateChange = () => {} } = {}) {
    this.maxRetries = maxRetries;
    this.onStateChange = onStateChange;

    this.state = AVAILABILITY_STATE.IDLE;
    this.nodeStatus = SERVICE_STATUS.UNKNOWN;
    this.aiStatus = SERVICE_STATUS.UNKNOWN;
    this.retryCount = 0;
    this.showRecoveryNotice = false;

    this.attempt = 0;
    this.activeTimer = null;
    this.activeAbort = null;
    this.isMounted = true;
    this.isProbing = false;
    this.prevWasStarting = false;
    this.history = [];
  }

  record(event, details = {}) {
    this.history.push({ state: this.state, attempt: this.attempt, event, ...details });
  }

  updateState(newState) {
    this.state = newState;
    this.record('state_change', { newState });
    this.onStateChange(newState);
  }

  clearTimer() {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }

  abortInFlight() {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    this.isProbing = false;
    this.record('abort_in_flight');
  }

  async simulateStrictModeMount() {
    this.record('mount_1');
    this.isMounted = true;
    const probe1 = this.executeProbe({ isManual: false, targetAttempt: 1, isInitialMount: true });

    // StrictMode unmount
    this.record('unmount_1');
    this.isMounted = false;
    this.clearTimer();
    this.abortInFlight();

    // StrictMode remount
    this.record('mount_2');
    this.isMounted = true;
    const probe2 = this.executeProbe({ isManual: false, targetAttempt: 1, isInitialMount: true });
    await Promise.allSettled([probe1]);
    return probe2;
  }

  async executeProbe({ isManual = false, targetAttempt = null, preserveAttempt = false, isInitialMount = false } = {}) {
    this.clearTimer();

    if (isManual) {
      this.abortInFlight();
      this.attempt = 1;
      this.retryCount = 1;
      this.prevWasStarting = false;
      this.updateState(AVAILABILITY_STATE.CONNECTING);
    } else if (isInitialMount) {
      this.abortInFlight();
      this.attempt = 1;
      this.retryCount = 1;
    } else if (preserveAttempt) {
      this.retryCount = this.attempt;
    } else if (typeof targetAttempt === 'number') {
      this.attempt = targetAttempt;
      this.retryCount = targetAttempt;
    } else if (this.attempt === 0) {
      this.attempt = 1;
      this.retryCount = 1;
    }

    if (this.isProbing && !isManual && !isInitialMount) {
      this.record('probe_skipped_in_flight');
      return;
    }

    this.isProbing = true;
    this.updateState(AVAILABILITY_STATE.CHECKING);

    const controller = new AbortController();
    this.activeAbort = controller;

    try {
      const result = await probeServiceHealth('http://localhost:5000', controller.signal, 100);

      if (!this.isMounted) {
        this.record('probe_ignored_unmounted');
        return;
      }

      if (result.isAborted || controller.signal.aborted) {
        this.record('probe_ignored_aborted');
        return;
      }

      this.nodeStatus = result.node;
      this.aiStatus = result.ai;

      const isNodeUp = result.node === SERVICE_STATUS.AVAILABLE;
      const isAiUp = result.ai === SERVICE_STATUS.AVAILABLE;

      if (isNodeUp && isAiUp) {
        this.updateState(AVAILABILITY_STATE.AVAILABLE);
        this.attempt = 0;
        this.retryCount = 0;
        if (this.prevWasStarting) {
          this.showRecoveryNotice = true;
        }
        this.prevWasStarting = false;
        return;
      }

      this.prevWasStarting = true;

      if (preserveAttempt) {
        this.updateState(this.state);
        return;
      }

      if (this.attempt >= this.maxRetries) {
        this.updateState(AVAILABILITY_STATE.UNAVAILABLE);
        this.record('max_retries_reached');
        return;
      }

      this.updateState(AVAILABILITY_STATE.CONNECTING);
      const nextAttempt = this.attempt + 1;

      // Fast synchronous test dispatch for timer
      return new Promise((resolve) => {
        this.activeTimer = setTimeout(async () => {
          if (this.isMounted) {
            await this.executeProbe({ isManual: false, targetAttempt: nextAttempt });
          }
          resolve();
        }, 10);
      });
    } catch {
      if (!this.isMounted) return;
      this.nodeStatus = SERVICE_STATUS.STARTING;
      if (preserveAttempt) {
        this.updateState(this.state);
      } else if (this.attempt >= this.maxRetries) {
        this.updateState(AVAILABILITY_STATE.UNAVAILABLE);
      } else {
        this.updateState(AVAILABILITY_STATE.CONNECTING);
        const nextAttempt = this.attempt + 1;
        return new Promise((resolve) => {
          this.activeTimer = setTimeout(async () => {
            if (this.isMounted) {
              await this.executeProbe({ isManual: false, targetAttempt: nextAttempt });
            }
            resolve();
          }, 10);
        });
      }
    } finally {
      this.isProbing = false;
      if (this.activeAbort === controller) {
        this.activeAbort = null;
      }
    }
  }

  manualRetry() {
    return this.executeProbe({ isManual: true });
  }
}

// ==============================================================================
// TEST SCENARIOS
// ==============================================================================

const originalFetch = global.fetch;

try {
  // Test A: Fresh startup while Node and FastAPI are offline
  await runAsyncTest('Test A: Fresh startup with Node and FastAPI offline reaches UNAVAILABLE in 5 attempts without deadlock', async () => {
    // Mock backend returning connection refused
    global.fetch = async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    };

    const sim = new AvailabilityStateMachineSimulator({ maxRetries: 5 });

    // Execute StrictMode mount
    await sim.simulateStrictModeMount();

    // Verify it progressed through 5 attempts and reached UNAVAILABLE
    assert.equal(sim.state, AVAILABILITY_STATE.UNAVAILABLE, 'Must reach UNAVAILABLE');
    assert.equal(sim.attempt, 5, 'Must reach exactly 5 attempts');
    assert.equal(sim.nodeStatus, SERVICE_STATUS.STARTING);
    assert.equal(sim.isProbing, false, 'No probe should be left in flight');
  });

  // Test B: Frontend starts with Node offline, then Node starts while frontend remains open
  await runAsyncTest('Test B: Frontend starts offline, Node starts mid-cycle, recovers without tab switch', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount <= 2) {
        throw new Error('fetch failed: ECONNREFUSED');
      }
      // Node and AI online on attempt 3
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          services: {
            node: { status: 'available', available: true },
            ai: { status: 'available', available: true },
          },
        }),
      };
    };

    const sim = new AvailabilityStateMachineSimulator({ maxRetries: 5 });
    await sim.simulateStrictModeMount();

    assert.equal(sim.state, AVAILABILITY_STATE.AVAILABLE, 'Must recover to AVAILABLE');
    assert.equal(sim.nodeStatus, SERVICE_STATUS.AVAILABLE);
    assert.equal(sim.aiStatus, SERVICE_STATUS.AVAILABLE);
    assert.equal(sim.showRecoveryNotice, true, 'Must display recovery notice after waking up');
  });

  // Test C: Frontend starts with both services available, then both are stopped
  await runAsyncTest('Test C: Frontend starts online, then backend stops; transitions to UNAVAILABLE after 5 retries', async () => {
    let serverRunning = true;
    global.fetch = async () => {
      if (serverRunning) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            services: {
              node: { status: 'available', available: true },
              ai: { status: 'available', available: true },
            },
          }),
        };
      }
      throw new Error('fetch failed: ECONNREFUSED');
    };

    const sim = new AvailabilityStateMachineSimulator({ maxRetries: 5 });

    // 1. Initial mount online
    await sim.simulateStrictModeMount();
    assert.equal(sim.state, AVAILABILITY_STATE.AVAILABLE);

    // 2. Server stops; network failure occurs
    serverRunning = false;
    await sim.executeProbe({ isManual: false, targetAttempt: 1 });

    assert.equal(sim.state, AVAILABILITY_STATE.UNAVAILABLE, 'Must reach UNAVAILABLE');
    assert.equal(sim.attempt, 5);
  });

  // Test D: Frontend starts offline, retries exhausted, user clicks Retry Connection after starting backend
  await runAsyncTest('Test D: Retries exhausted, user starts backend and clicks Retry Connection; transitions to AVAILABLE', async () => {
    let serverRunning = false;
    global.fetch = async () => {
      if (serverRunning) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            services: {
              node: { status: 'available', available: true },
              ai: { status: 'available', available: true },
            },
          }),
        };
      }
      throw new Error('fetch failed: ECONNREFUSED');
    };

    const sim = new AvailabilityStateMachineSimulator({ maxRetries: 5 });

    // 1. Start offline until UNAVAILABLE
    await sim.simulateStrictModeMount();
    assert.equal(sim.state, AVAILABILITY_STATE.UNAVAILABLE);
    assert.equal(sim.attempt, 5);

    // 2. Start server and user clicks Retry Connection
    serverRunning = true;
    await sim.manualRetry();

    assert.equal(sim.state, AVAILABILITY_STATE.AVAILABLE, 'Manual retry must resolve to AVAILABLE');
    assert.equal(sim.attempt, 0, 'Attempt counter must be reset');
    assert.equal(sim.retryCount, 0);
  });

  // Test E: Only one backend is unavailable (Node online, FastAPI starting/unavailable)
  await runAsyncTest('Test E: Node online, FastAPI starting; represents independent states', async () => {
    global.fetch = async (_url, options) => {
      if (options?.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          services: {
            node: { status: 'available', available: true },
            ai: { status: 'starting', available: false },
          },
        }),
      };
    };

    const sim = new AvailabilityStateMachineSimulator({ maxRetries: 5 });
    await sim.simulateStrictModeMount();

    // Node is up, AI is starting, overall state reached UNAVAILABLE after max retries for AI
    assert.equal(sim.nodeStatus, SERVICE_STATUS.AVAILABLE, 'Node should be detected as AVAILABLE');
    assert.equal(sim.aiStatus, SERVICE_STATUS.STARTING, 'AI should be detected as STARTING');
    assert.equal(sim.state, AVAILABILITY_STATE.UNAVAILABLE, 'Aggregate retries exhausted for AI service');
  });

} finally {
  global.fetch = originalFetch;
}

console.log('\n======================================================');
console.log(`  LIFECYCLE RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('======================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}

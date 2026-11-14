import assert from 'node:assert/strict';
import {
  AVAILABILITY_STATE,
  SERVICE_STATUS,
  RECRUITER_MESSAGES,
  getApiBaseUrl,
  isColdStartError,
  isAuthError,
  isAiEndpoint,
  calculateBackoffDelay,
  probeServiceHealth,
} from '../src/utils/serviceAvailability.js';
import axios from '../src/utils/api.js';

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

console.log('=================================================');
console.log('  PREPAI SERVICE AVAILABILITY & COLD-START TESTS ');
console.log('=================================================\n');

// --- Suite 1: Recruiter-Friendly Messages Contract ---
console.log('--- Suite 1: Recruiter-Friendly Messages Contract ---');

runTest('Exact recruiter title and message for Node backend cold start', () => {
  assert.equal(RECRUITER_MESSAGES.NODE_STARTING_TITLE, 'Our demo server is waking up');
  assert.equal(
    RECRUITER_MESSAGES.NODE_STARTING_MSG,
    "PrepAI's free demo server may take a moment to start after inactivity. We're establishing a connection. Thanks for your patience."
  );
});

runTest('Exact recruiter title and message for AI service cold start', () => {
  assert.equal(RECRUITER_MESSAGES.AI_STARTING_TITLE, 'AI services are starting');
  assert.equal(
    RECRUITER_MESSAGES.AI_STARTING_MSG,
    'The application is available, but our AI processing service is temporarily starting up. Your session is safe. Please try again shortly.'
  );
});

runTest('Exact recruiter title and message for unavailable demo server', () => {
  assert.equal(RECRUITER_MESSAGES.UNAVAILABLE_TITLE, 'Unable to connect to the demo server');
  assert.equal(
    RECRUITER_MESSAGES.UNAVAILABLE_MSG,
    'Our demo server is currently unavailable or taking longer than expected to start. Please try reconnecting.'
  );
});

runTest('Clear title and message when both demo services are starting', () => {
  assert.equal(RECRUITER_MESSAGES.BOTH_STARTING_TITLE, 'Demo environment is starting');
  assert.ok(RECRUITER_MESSAGES.BOTH_STARTING_MSG.includes('demo servers are waking up'));
});

// --- Suite 2: Error Classification ---
console.log('\n--- Suite 2: Cold-Start & Auth Error Classification ---');

runTest('Authentication errors (401/403) are strictly excluded from service downtime', () => {
  const err401 = { response: { status: 401 } };
  const err403 = { response: { status: 403 } };

  assert.equal(isAuthError(err401), true);
  assert.equal(isAuthError(err403), true);
  assert.equal(isColdStartError(err401), false, '401 must not be classified as cold start');
  assert.equal(isColdStartError(err403), false, '403 must not be classified as cold start');
});

runTest('Render cold-start gateway errors (502, 503, 504) are identified as cold start', () => {
  assert.equal(isColdStartError({ response: { status: 502 } }), true);
  assert.equal(isColdStartError({ response: { status: 503 } }), true);
  assert.equal(isColdStartError({ response: { status: 504 } }), true);
});

runTest('Network transport errors and connection timeouts are identified as cold start', () => {
  assert.equal(isColdStartError({ code: 'ERR_NETWORK' }), true);
  assert.equal(isColdStartError({ message: 'Network Error' }), true);
  assert.equal(isColdStartError({ code: 'ECONNABORTED' }), true);
  assert.equal(isColdStartError({ message: 'Failed to fetch' }), true);
});

runTest('Client application errors (400, 404, 422) are not classified as downtime', () => {
  assert.equal(isColdStartError({ response: { status: 400 } }), false);
  assert.equal(isColdStartError({ response: { status: 404 } }), false);
  assert.equal(isColdStartError({ response: { status: 422 } }), false);
});

// --- Suite 3: Endpoint Routing & Feature Mapping ---
console.log('\n--- Suite 3: Feature & Endpoint AI Routing ---');

runTest('Correctly identifies AI microservice endpoints', () => {
  assert.equal(isAiEndpoint('/api/interview/start'), true);
  assert.equal(isAiEndpoint('/api/interview/session123/answer'), true);
  assert.equal(isAiEndpoint('/api/behavioral-chat'), true);
  assert.equal(isAiEndpoint('/api/upload-resume'), true);

  // General Node endpoints
  assert.equal(isAiEndpoint('/api/user/progress'), false);
  assert.equal(isAiEndpoint('/api/user/preferences'), false);
  assert.equal(isAiEndpoint('/api/generate-problem'), false);
  assert.equal(isAiEndpoint('/api/run-code'), false);
  assert.equal(isAiEndpoint('/api/evaluate-code'), false);
  assert.equal(isAiEndpoint('/api/health'), false);
});

// --- Suite 4: Controlled Exponential Backoff ---
console.log('\n--- Suite 4: Controlled Exponential Backoff ---');

runTest('Backoff delay scales smoothly and is capped at maximum ceiling', () => {
  const delay1 = calculateBackoffDelay(1, 3000, 1.6, 15000);
  const delay2 = calculateBackoffDelay(2, 3000, 1.6, 15000);
  const delay3 = calculateBackoffDelay(3, 3000, 1.6, 15000);
  const delay5 = calculateBackoffDelay(5, 3000, 1.6, 15000);
  const delay10 = calculateBackoffDelay(10, 3000, 1.6, 15000);

  assert.ok(delay1 >= 2500 && delay1 <= 3500, `Attempt 1: ${delay1}`);
  assert.ok(delay2 > delay1, `Attempt 2 (${delay2}) should exceed Attempt 1 (${delay1})`);
  assert.ok(delay3 > delay2, `Attempt 3 (${delay3}) should exceed Attempt 2 (${delay2})`);
  assert.ok(delay5 <= 16500, `Attempt 5 capped around 15s`);
  assert.ok(delay10 <= 16500, `Attempt 10 capped around 15s`);
});

// --- Suite 5: probeServiceHealth Contract ---
console.log('\n--- Suite 5: probeServiceHealth Network Diagnostics ---');

const originalFetch = global.fetch;

try {
  await runAsyncTest('probeServiceHealth parses fully available backend and AI services', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        services: {
          node: { status: 'available', available: true },
          ai: { status: 'available', available: true },
        },
      }),
    });

    const result = await probeServiceHealth('http://localhost:5000');
    assert.equal(result.node, SERVICE_STATUS.AVAILABLE);
    assert.equal(result.ai, SERVICE_STATUS.AVAILABLE);
  });

  await runAsyncTest('probeServiceHealth identifies when Node is up but AI service is starting', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        services: {
          node: { status: 'available', available: true },
          ai: { status: 'starting', available: false },
        },
      }),
    });

    const result = await probeServiceHealth('http://localhost:5000');
    assert.equal(result.node, SERVICE_STATUS.AVAILABLE);
    assert.equal(result.ai, SERVICE_STATUS.STARTING);
  });

  await runAsyncTest('probeServiceHealth identifies when Node is sleeping or returns 502/503', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });

    const result = await probeServiceHealth('http://localhost:5000');
    assert.equal(result.node, SERVICE_STATUS.STARTING);
  });

  await runAsyncTest('probeServiceHealth handles complete network failure during cold start', async () => {
    global.fetch = async () => {
      throw new Error('fetch failed (ECONNREFUSED)');
    };

    const result = await probeServiceHealth('http://localhost:5000');
    assert.equal(result.node, SERVICE_STATUS.STARTING);
  });

} finally {
  global.fetch = originalFetch;
}

// --- Suite 6: Centralized Axios Interceptor Sanitization ---
console.log('\n--- Suite 6: Axios Interceptor Sanitization ---');

await runAsyncTest('Axios interceptor translates 502 on Node endpoint into recruiter-friendly message', async () => {
  try {
    await axios.get('http://fake-cold-start-url/api/user/progress', {
      adapter: async (config) => {
        const err = new Error('Request failed with status code 502');
        err.config = config;
        err.response = { status: 502, data: {}, config };
        throw err;
      },
    });
    assert.fail('Should have rejected');
  } catch (err) {
    assert.equal(err.isColdStart, true);
    assert.equal(err.userFriendlyMessage, RECRUITER_MESSAGES.NODE_STARTING_MSG);
    assert.equal(err.response?.data?.message, RECRUITER_MESSAGES.NODE_STARTING_MSG);
  }
});

await runAsyncTest('Axios interceptor translates 503 on AI endpoint into recruiter-friendly AI message', async () => {
  try {
    await axios.post('http://fake-cold-start-url/api/interview/start', {}, {
      adapter: async (config) => {
        const err = new Error('Request failed with status code 503');
        err.config = config;
        err.response = { status: 503, data: {}, config };
        throw err;
      },
    });
    assert.fail('Should have rejected');
  } catch (err) {
    assert.equal(err.isColdStart, true);
    assert.equal(err.userFriendlyMessage, RECRUITER_MESSAGES.AI_STARTING_MSG);
    assert.equal(err.response?.data?.message, RECRUITER_MESSAGES.AI_STARTING_MSG);
  }
});

await runAsyncTest('Axios interceptor does not rewrite 401 authentication errors', async () => {
  try {
    await axios.get('http://fake-cold-start-url/api/user/progress', {
      adapter: async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Token expired' } };
        throw err;
      },
    });
    assert.fail('Should have rejected');
  } catch (err) {
    assert.equal(err.isColdStart, undefined);
    assert.equal(err.response?.data?.message, 'Token expired');
  }
});

// --- Suite 7: Authoritative State Machine & URL Resolution ---
console.log('\n--- Suite 7: Authoritative State Machine & URL Resolution ---');

runTest('Authoritative AVAILABILITY_STATE enums are defined strictly', () => {
  assert.equal(AVAILABILITY_STATE.IDLE, 'IDLE');
  assert.equal(AVAILABILITY_STATE.CHECKING, 'CHECKING');
  assert.equal(AVAILABILITY_STATE.AVAILABLE, 'AVAILABLE');
  assert.equal(AVAILABILITY_STATE.CONNECTING, 'CONNECTING');
  assert.equal(AVAILABILITY_STATE.UNAVAILABLE, 'UNAVAILABLE');
  assert.equal(AVAILABILITY_STATE.PAUSED, 'PAUSED');
});

runTest('getApiBaseUrl returns valid local fallback without trailing slash', () => {
  const url = getApiBaseUrl();
  assert.ok(url.startsWith('http'), `URL should start with http: ${url}`);
  assert.equal(url.endsWith('/'), false, `URL should not have trailing slash: ${url}`);
});

runTest('Default backoff delay caps at 8000ms max', () => {
  const d1 = calculateBackoffDelay(1);
  const d5 = calculateBackoffDelay(5);
  assert.ok(d1 >= 1800 && d1 <= 2200, `Default attempt 1 around 2s: ${d1}`);
  assert.ok(d5 <= 8800, `Default attempt 5 capped around 8s: ${d5}`);
});

await runAsyncTest('probeServiceHealth cleanly captures caller abort signal', async () => {
  const controller = new AbortController();
  controller.abort();

  const result = await probeServiceHealth('http://localhost:5000', controller.signal);
  assert.equal(result.isAborted, true);
  assert.equal(result.node, SERVICE_STATUS.STARTING);
});

await runAsyncTest('probeServiceHealth timeout is treated as failed check, NOT caller aborted', async () => {
  const originalFetch = global.fetch;
  global.fetch = (_url, options) => {
    return new Promise((_, reject) => {
      // simulate fetch hanging until signal aborted by internal timeout
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  };

  try {
    // 50ms fast timeout for test
    const result = await probeServiceHealth('http://localhost:5000', null, 50);
    assert.equal(result.isAborted, false, 'Timeout must not be marked as caller aborted');
    assert.equal(result.isTimeout, true, 'Timeout flag must be set to true');
    assert.equal(result.node, SERVICE_STATUS.STARTING);
  } finally {
    global.fetch = originalFetch;
  }
});

console.log('\n=================================================');
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('=================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}

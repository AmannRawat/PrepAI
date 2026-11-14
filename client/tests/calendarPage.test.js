import assert from 'node:assert/strict';
import { isColdStartError } from '../src/utils/serviceAvailability.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

console.log('=================================================');
console.log('  CALENDAR PAGE & ROUTE ERROR BOUNDARY TESTS     ');
console.log('=================================================\n');

runTest('CalendarPage.jsx defines fetchCalendarData in component scope', () => {
  const calendarPageCode = fs.readFileSync(
    path.join(__dirname, '../src/pages/CalendarPage.jsx'),
    'utf-8'
  );

  assert.ok(
    calendarPageCode.includes('const fetchCalendarData = useCallback('),
    'fetchCalendarData must be defined via useCallback'
  );

  assert.ok(
    calendarPageCode.includes('onClick={fetchCalendarData}'),
    'onClick handler must reference fetchCalendarData'
  );

  assert.ok(
    !calendarPageCode.includes('runFetch();'),
    'Obsolescent runFetch function must be replaced by fetchCalendarData'
  );
});

runTest('CalendarPage.jsx uses friendly offline message on connection error', () => {
  const calendarPageCode = fs.readFileSync(
    path.join(__dirname, '../src/pages/CalendarPage.jsx'),
    'utf-8'
  );

  const expectedFriendlyMsg =
    "Your calendar is temporarily unavailable because we couldn't connect to the server.";

  assert.ok(
    calendarPageCode.includes(expectedFriendlyMsg),
    `CalendarPage must contain exact friendly message: "${expectedFriendlyMsg}"`
  );
});

runTest('CalendarPage.jsx enforces 6-second request timeout and getApiBaseUrl', () => {
  const calendarPageCode = fs.readFileSync(
    path.join(__dirname, '../src/pages/CalendarPage.jsx'),
    'utf-8'
  );

  assert.ok(
    calendarPageCode.includes('getApiBaseUrl()'),
    'Must resolve API URL through getApiBaseUrl()'
  );

  assert.ok(
    calendarPageCode.includes('timeout: 6000') || calendarPageCode.includes('6000'),
    'Must enforce 6-second bounded timeout'
  );
});

runTest('RouteErrorBoundary and PageErrorBoundary components exist and are integrated', () => {
  const routeBoundaryCode = fs.readFileSync(
    path.join(__dirname, '../src/components/RouteErrorBoundary.jsx'),
    'utf-8'
  );

  const pageBoundaryCode = fs.readFileSync(
    path.join(__dirname, '../src/components/PageErrorBoundary.jsx'),
    'utf-8'
  );

  const mainCode = fs.readFileSync(
    path.join(__dirname, '../src/main.jsx'),
    'utf-8'
  );

  const layoutCode = fs.readFileSync(
    path.join(__dirname, '../src/components/Layout.jsx'),
    'utf-8'
  );

  assert.ok(routeBoundaryCode.includes('useRouteError'), 'RouteErrorBoundary must use useRouteError');
  assert.ok(pageBoundaryCode.includes('componentDidCatch'), 'PageErrorBoundary must implement componentDidCatch');
  assert.ok(mainCode.includes('errorElement: <RouteErrorBoundary />'), 'main.jsx router must configure errorElement');
  assert.ok(layoutCode.includes('<PageErrorBoundary'), 'Layout.jsx must wrap Outlet with PageErrorBoundary');
});

runTest('isColdStartError identifies network disconnection for CalendarPage errors', () => {
  const netErr = { code: 'ERR_NETWORK', message: 'Network Error' };
  const timeoutErr = { code: 'ECONNABORTED', message: 'timeout of 6000ms exceeded' };
  const abortErr = { name: 'AbortError', message: 'The user aborted a request' };

  assert.equal(isColdStartError(netErr), true);
  assert.equal(isColdStartError(timeoutErr), true);
  assert.equal(isColdStartError(abortErr), true);
});

console.log('\n=================================================');
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('=================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}


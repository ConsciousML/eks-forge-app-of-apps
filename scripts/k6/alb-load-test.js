// Local k6 load test against an app's public ALB. See docs/test-slos-under-load.md.
// Inputs (-e): BASE_URL (required), RATE req/s (200), DURATION (10m), RTT_MS (0), VUS (200), MAX_VUS (1000).
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const RTT_MS = Number(__ENV.RTT_MS || 0);
const fast = new Counter('server_fast');
const slow = new Counter('server_slow');
const status5xx = new Counter('status_5xx');

export const options = {
  discardResponseBodies: true,
  scenarios: {
    load: {
      // Open model: a fixed request rate, like real users, whatever the response time.
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 200),
      timeUnit: '1s',
      duration: __ENV.DURATION || '10m',
      preAllocatedVUs: Number(__ENV.VUS || 200),
      maxVUs: Number(__ENV.MAX_VUS || 1000),
    },
  },
  summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const r = http.get(__ENV.BASE_URL);
  if (r.status >= 500) status5xx.add(1);
  // TTFB minus the network round trip approximates the ALB's TargetResponseTime. 100ms is the SLO threshold.
  (r.timings.waiting - RTT_MS <= 100 ? fast : slow).add(1);
}

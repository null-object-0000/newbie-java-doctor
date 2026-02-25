import http from 'k6/http';
import { check } from 'k6';

export const options = {
  noUsageReport: true,
  discardResponseBodies: true,
  vus: 4000,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [{ threshold: 'avg<750', abortOnFail: true, delayAbortEval: '10s' }],
  },
  summaryTrendStats: ['avg', 'min', 'max', 'p(95)', 'p(99)', 'count'],
};

export default function () {
  const res = http.get('http://java-bff:8080/api/goods-detail');
  check(res, { 'status was 200': (r) => r.status === 200 });
}

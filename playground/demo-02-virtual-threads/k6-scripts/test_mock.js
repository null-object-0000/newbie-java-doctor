import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '0s', target: 10000 },
    { duration: '30s', target: 10000 },
    { duration: '0s', target: 0 },
  ],
  thresholds: {
    checks: [{ threshold: 'rate>=0', abortOnFail: false }],
  },
};

export default function () {
  const res = http.get('http://slow-api:8080/api/logistics');
  check(res, { 'status was 200': (r) => r.status === 200 });
}

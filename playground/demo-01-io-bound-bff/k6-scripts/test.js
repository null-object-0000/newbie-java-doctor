import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 500 },
    { duration: '30s', target: 1000 }, // 最高压到 1000 并发
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  const res = http.get('http://java-bff:8080/api/goods-detail');
  check(res, { 'status was 200': (r) => r.status === 200 });
}
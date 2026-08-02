#!/bin/bash
# 验证 /api/auth/login 限流 + 429 + Retry-After
URL='http://127.0.0.1:3111/api/auth/login'
for i in $(seq 1 32); do
  curl.exe -sS -o /dev/null \
    -w "%{http_code} rl=%header{x-ratelimit-remaining} retry=%header{retry-after}\n" \
    -X POST "$URL" \
    -H 'Content-Type: application/json' \
    -d '{"phone":"13800000001","password":"wrongpass"}' \
    --max-time 5
done
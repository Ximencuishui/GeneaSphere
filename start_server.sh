#!/bin/bash
export JWT_SECRET="geneasphere-jwt-secret-key-2026-secure-random-string-minimum-32-chars"
export DATABASE_URL="postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere"
export NODE_ENV=production
cd /opt/geneasphere/apps/server
node dist/main.js

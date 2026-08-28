#!/bin/bash
# 使用docker运行psql
docker exec -i geneasphere-postgres psql -U geneauser -c "DROP DATABASE IF EXISTS geneasphere;" 2>/dev/null || true
docker exec -i geneasphere-postgres psql -U geneauser -c "CREATE DATABASE geneasphere;" 2>/dev/null || true
# 停止服务
pm2 stop all
# 运行迁移
export DATABASE_URL="postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere"
cd /opt/geneasphere/packages/db
npx prisma migrate deploy
# 重启服务
pm2 restart all

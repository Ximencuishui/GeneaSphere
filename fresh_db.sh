#!/bin/bash
export PGPASSWORD=GeneaSphere2024!
# 删除并重建数据库
psql -h 127.0.0.1 -p 15432 -U geneauser -c "DROP DATABASE IF EXISTS geneasphere;"
psql -h 127.0.0.1 -p 15432 -U geneauser -c "CREATE DATABASE geneasphere;"
# 运行迁移
export DATABASE_URL="postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere"
cd /opt/geneasphere/packages/db
npx prisma migrate deploy

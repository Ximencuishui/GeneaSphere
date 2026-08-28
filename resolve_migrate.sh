#!/bin/bash
export DATABASE_URL="postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere"
cd /opt/geneasphere/packages/db
# 标记失败的迁移为已解决
npx prisma migrate resolve --applied 20260623000000_add_ocr_quota
# 重新运行迁移
npx prisma migrate deploy

#!/bin/bash
export DATABASE_URL="postgresql://geneauser:GeneaSphere2024!@127.0.0.1:15432/geneasphere"
cd /opt/geneasphere/packages/db
npx prisma migrate deploy

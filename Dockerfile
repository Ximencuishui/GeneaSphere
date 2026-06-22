FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 复制整个 monorepo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma/
COPY packages/db/src packages/db/src/
COPY apps/server/package.json apps/server/
COPY apps/server/tsconfig.json apps/server/
COPY apps/server/tsconfig.build.json apps/server/
COPY apps/server/nest-cli.json apps/server/
COPY apps/server/src apps/server/src/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 生成 Prisma Client
RUN pnpm --filter @geneasphere/db exec prisma generate

# 构建 server
RUN pnpm --filter server build

EXPOSE 3000

CMD ["node", "apps/server/dist/main.js"]

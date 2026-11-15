FROM node:20-alpine

# 不换基础镜像。Alpine 源没有楷体、仿宋，构建时下载三款可再分发的字体并交给 fontconfig：
# 宋体 AR PL UMing CN（文鼎明体，Arphic Public License）
# 楷体 LXGW WenKai / 霞鹜文楷 1.530（SIL OFL 1.1）
# 仿宋 Zhuque Fangsong (technical preview) / 朱雀仿宋 0.212（SIL OFL 1.1）
# 方正仿宋没有开放再分发许可，不能放进镜像。
# Noto CJK、文泉驿只补缺字。官方地址失败时改走 ghfast，三个文件都校验 sha256。
RUN apk add --no-cache fontconfig font-noto-cjk font-wqy-zenhei \
 && apk add --no-cache --virtual .font-fetch curl unzip tar xz binutils \
 && mkdir -p /usr/share/fonts/geneasphere /tmp/genea-fonts \
 && fetch() { \
      out="$1"; sha="$2"; shift 2; ok=0; \
      for url in "$@"; do \
        if curl -fsSL --retry 3 --retry-delay 2 -o "$out" "$url"; then ok=1; break; fi; \
      done; \
      if [ "$ok" != 1 ]; then echo "font download failed: $out" >&2; return 1; fi; \
      echo "$sha  $out" | sha256sum -c -; \
    } \
 && fetch /tmp/genea-fonts/LXGWWenKai-Regular.ttf \
      2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b \
      https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf \
      https://ghfast.top/https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf \
 && fetch /tmp/genea-fonts/ZhuqueFangsong-v0.212.zip \
      bb8b661a7643d2296a72d9d10530a00949419c4e527fb61783f73c2ba1a8c062 \
      https://github.com/TrionesType/zhuque/releases/download/v0.212/ZhuqueFangsong-v0.212.zip \
      https://ghfast.top/https://github.com/TrionesType/zhuque/releases/download/v0.212/ZhuqueFangsong-v0.212.zip \
 && fetch /tmp/genea-fonts/fonts-arphic-uming.deb \
      2676b21b90df94f23418610291b71b43720c95cdccb420b97ab56edfd3ce4cf5 \
      https://deb.debian.org/debian/pool/main/f/fonts-arphic-uming/fonts-arphic-uming_0.2.20080216.2-11_all.deb \
 && unzip -j /tmp/genea-fonts/ZhuqueFangsong-v0.212.zip ZhuqueFangsong-Regular.ttf -d /usr/share/fonts/geneasphere \
 && cp /tmp/genea-fonts/LXGWWenKai-Regular.ttf /usr/share/fonts/geneasphere/ \
 && (cd /tmp/genea-fonts && ar x fonts-arphic-uming.deb && tar -xJf data.tar.xz) \
 && find /tmp/genea-fonts -name uming.ttc -exec cp {} /usr/share/fonts/geneasphere/ \; \
 && printf '%s\n' \
      'LXGW WenKai 1.530: SIL Open Font License 1.1, https://github.com/lxgw/LxgwWenKai' \
      'Zhuque Fangsong 0.212 technical preview: SIL Open Font License 1.1, https://github.com/TrionesType/zhuque' \
      'AR PL UMing 0.2.20080216.2: Arphic Public License, Debian package fonts-arphic-uming' \
      > /usr/share/fonts/geneasphere/NOTICE \
 && printf '%s\n' \
      '<?xml version="1.0"?>' \
      '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">' \
      '<fontconfig>' \
      '  <alias binding="strong">' \
      '    <family>宋体</family>' \
      '    <prefer><family>AR PL UMing CN</family></prefer>' \
      '  </alias>' \
      '  <alias binding="strong">' \
      '    <family>楷体</family>' \
      '    <prefer><family>LXGW WenKai</family></prefer>' \
      '  </alias>' \
      '  <alias binding="strong">' \
      '    <family>仿宋</family>' \
      '    <prefer><family>Zhuque Fangsong (technical preview)</family></prefer>' \
      '  </alias>' \
      '</fontconfig>' \
      > /etc/fonts/conf.d/99-geneasphere.conf \
 && fc-cache -f \
 && rm -rf /tmp/genea-fonts \
 && apk del .font-fetch

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

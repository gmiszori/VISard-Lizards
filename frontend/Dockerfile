FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM caddy:2-alpine AS caddy

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /srv
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app /app
COPY scripts/container-entrypoint.sh /usr/local/bin/container-entrypoint.sh
ENTRYPOINT ["sh", "/usr/local/bin/container-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
EXPOSE 8080

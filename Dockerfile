FROM node:22.23.4-alpine AS base

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.28.11 --activate

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
USER node
EXPOSE 3000
ENTRYPOINT ["node"]
CMD ["--env-file-if-exists=.env", "dist/src/main.api.js"]

# API + web UI in one container. The build context is the repository root.
# Keep the Node and pnpm versions in step with .mise.toml.
FROM node:24.22.3-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.34.9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/qdify/shared/package.json apps/qdify/shared/
COPY apps/qdify/api/package.json apps/qdify/api/
COPY apps/qdify/web/package.json apps/qdify/web/
RUN pnpm install --frozen-lockfile \
  --filter alice --filter "@alice/qdify-api..." --filter "@alice/qdify-web..."

COPY apps/qdify/shared apps/qdify/shared
COPY apps/qdify/api apps/qdify/api
COPY apps/qdify/web apps/qdify/web
# moon isn't used in here: it expects git and the whole workspace.
RUN cd apps/qdify/shared && pnpm exec tsc -p tsconfig.build.json \
  && cd ../api && pnpm exec tsc -p tsconfig.build.json \
  && cd ../web && pnpm exec vite build
RUN pnpm --filter @alice/qdify-api deploy --prod --legacy /out

FROM node:24.22.3-bookworm-slim
ENV NODE_ENV=production \
    QDIFY_HOST=0.0.0.0 \
    QDIFY_PORT=8787 \
    QDIFY_DB_PATH=/data/qdify.db \
    QDIFY_WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/apps/qdify/web/dist ./web
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --start-interval=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.QDIFY_PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/main.js"]

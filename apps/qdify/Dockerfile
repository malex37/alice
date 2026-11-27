# API + web UI in one container; tasks live in DynamoDB (MiniStack locally).
# The build context is apps/qdify.
# Keep the Node and pnpm versions in step with .mise.toml.
FROM node:24.22.3-bookworm-slim AS build
WORKDIR /qdify
RUN npm install --global pnpm@10.34.9

COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

COPY shared shared
COPY api api
COPY web web
# moon isn't used in here: it expects git and the whole workspace.
RUN cd shared && pnpm exec tsc -p tsconfig.build.json \
  && cd ../api && pnpm exec tsc -p tsconfig.build.json \
  && cd ../web && pnpm exec vite build
RUN pnpm --filter @alice/qdify-api deploy --prod --legacy /out

FROM node:24.22.3-bookworm-slim
ENV NODE_ENV=production \
    QDIFY_HOST=0.0.0.0 \
    QDIFY_PORT=8787 \
    QDIFY_WEB_DIST=/app/web
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /qdify/web/dist ./web
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --start-interval=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.QDIFY_PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

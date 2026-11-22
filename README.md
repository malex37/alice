# Alice

A polyglot monorepo for apps hosted locally and on a private AWS account.
[moon](https://moonrepo.dev) runs tasks and [mise](https://mise.jdx.dev) pins every tool,
including moon. The root is language-neutral: each app owns its package workspace.

| Project | Path | What it is |
| --- | --- | --- |
| `qdify-shared` | `apps/qdify/shared` | Task contract (zod) |
| `qdify-api` | `apps/qdify/api` | Fastify + SQLite API |
| `qdify-web` | `apps/qdify/web` | React web UI |
| `qdify-homeassistant` | `apps/qdify/homeassistant` | Home Assistant to-do integration |
| `infra-aws` | `infra/aws` | AWS CDK plan (no code yet) |

## Setup

Requires [mise](https://mise.jdx.dev) activated in your shell (or prefix commands with
`mise exec --`).

```sh
mise install
pnpm --dir apps/qdify install
moon run :typecheck :lint :test :build
```

## Develop qdify

```sh
moon run qdify-api:dev    # http://127.0.0.1:8787
moon run qdify-web:dev    # http://localhost:5173, proxies /api
```

## Host qdify locally

From `apps/qdify`:

```sh
cp .env.example .env                # then set QDIFY_API_TOKEN (openssl rand -hex 32)
docker compose up -d --build        # http://localhost:8787
```

It listens on loopback only. Set `QDIFY_BIND=0.0.0.0` in `.env` if Home Assistant runs on
another machine. It serves plain HTTP, so don't expose it to the internet.

On WSL2, either turn on Docker Desktop's WSL integration for this distro or use `docker.exe`.

Tasks live in the `qdify_qdify-data` volume. `docker compose down` keeps it;
`docker compose down -v` deletes it.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `QDIFY_HOST` | `127.0.0.1` | Listen address (`0.0.0.0` in the container) |
| `QDIFY_PORT` | `8787` | Listen port |
| `QDIFY_DB_PATH` | `data/qdify.db` | SQLite file |
| `QDIFY_API_TOKEN` | unset | Bearer token for `/api/tasks`; required by compose |
| `QDIFY_WEB_DIST` | unset | Web build to serve |

## API

| Route | Notes |
| --- | --- |
| `GET /api/health` | Public |
| `GET /api/tasks` | Optional `?status=open` or `?status=done` |
| `POST /api/tasks` | `title` is required |
| `GET /api/tasks/:id` | |
| `PATCH /api/tasks/:id` | Omitted fields are kept; `null` clears `notes` and `dueDate` |
| `DELETE /api/tasks/:id` | |

## More

- [Adding a project in any language](docs/monorepo.md)
- [Home Assistant integration](apps/qdify/homeassistant/README.md)
- [AWS plan](infra/aws/PLAN.md)

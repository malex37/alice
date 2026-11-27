# In case of lib

How to restructure the Node configuration when TypeScript packages need to link across apps.

Today each app owns a pnpm workspace (`apps/qdify` is the only one), so the repo root has no
Node files. The catch is that `workspace:*` only resolves inside one workspace.

## Do you need this?

| Situation                                                             | What to do                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Packages in the same app share code                                   | Nothing. Use `workspace:*`, as `qdify-api` does with `qdify-shared`. |
| One small library that isn't shipped in a Docker image                | Use [`link:`](#small-case-link) and keep the layout.                 |
| Several libraries or consumers, or a linked library ships in an image | [Lift the workspace to the root](#lift-the-workspace-to-the-root).   |

## Small case: `link:`

In the consumer's `package.json`, with a path relative to that package:

```json
{ "dependencies": { "@alice/example": "link:../../../libs/example" } }
```

Then:

- Add the library's moon id to the consumer's `dependsOn`.
- Install the library separately. pnpm doesn't install a linked package's dependencies.

This stops scaling because the library has its own dependency versions (two copies of zod
or React can break types or hooks), and because it is outside the app's Docker build context.

## Lift the workspace to the root

The result is one workspace and one lockfile for all Node packages:

```text
.
├── .dockerignore          moved from apps/qdify
├── pnpm-lock.yaml         moved from apps/qdify
├── pnpm-workspace.yaml    moved from apps/qdify
├── tsconfig.base.json     moved from apps/qdify
├── node_modules/          generated, gitignored
├── apps/qdify/{shared,api,web}
└── libs/example
```

The root still needs **no `package.json`**, and moon still comes from mise.

The commands below assume qdify is the only workspace, GNU sed, mise active in your shell,
and a clean git tree. Run them in order from the repo root, in bash. The Docker checks also
need `apps/qdify/.env` (copy `.env.example` and set a token).

### 1. Move the workspace files

```bash
git mv apps/qdify/pnpm-lock.yaml apps/qdify/pnpm-workspace.yaml .
git mv apps/qdify/tsconfig.base.json apps/qdify/.dockerignore .
rm -rf apps/qdify/node_modules apps/qdify/*/node_modules
```

### 2. Widen the workspace

Globs only pick up directories that have a `package.json`, so other languages are ignored.

```bash
sed -i \
  -e "s#^  - 'shared'\$#  - 'apps/*/*'\n  - 'libs/*'\n  - 'infra/*'#" \
  -e "/^  - 'api'\$/d" \
  -e "/^  - 'web'\$/d" \
  pnpm-workspace.yaml
```

### 3. Repoint the tsconfigs

```bash
sed -i 's#"\.\./tsconfig\.base\.json"#"../../../tsconfig.base.json"#' \
  apps/qdify/*/tsconfig.json
```

### 4. Make the moon inputs global to TypeScript

With one lockfile, the per-workspace tag is no longer needed. Skipping this step leaves
moon serving stale cached results after dependency changes.

```bash
git rm -q .moon/tasks/qdify-pnpm.yml
sed -i '/^tags: \[qdify-pnpm\]$/d' apps/qdify/*/moon.yml
cat >> .moon/tasks/typescript.yml <<'EOF'

implicitInputs:
  - '/pnpm-lock.yaml'
  - '/pnpm-workspace.yaml'
  - '/tsconfig.base.json'
EOF
```

### 5. Widen the Docker build context

The context becomes the repo root, which holds local secrets such as `.credentials`. Keep
`.dockerignore` an allowlist (first rule `*`), and leave the secret exclusions last so
they win.

```bash
cat > .dockerignore <<'EOF'
# Allowlist: secrets and unrelated files can never enter an image build context.
*
!pnpm-lock.yaml
!pnpm-workspace.yaml
!tsconfig.base.json
!apps
apps/*
!apps/qdify
apps/qdify/*
!apps/qdify/shared
!apps/qdify/api
!apps/qdify/web
!libs
**/node_modules
**/dist
**/data
**/.env
**/.env.*
**/.credentials*
**/*.db
**/*.db-*
EOF

sed -i 's#^    build: \.$#    build:\n      context: ../..\n      dockerfile: apps/qdify/Dockerfile#' \
  apps/qdify/compose.yaml

sed -i -E \
  -e 's#build context is apps/qdify\.#build context is the repository root.#' \
  -e 's#^COPY (shared|api|web)/package\.json .*#COPY apps/qdify/\1/package.json apps/qdify/\1/#' \
  -e 's#^COPY (shared|api|web) .*#COPY apps/qdify/\1 apps/qdify/\1#' \
  -e 's#^RUN pnpm install --frozen-lockfile$#RUN pnpm install --frozen-lockfile --filter "@alice/qdify-api..." --filter "@alice/qdify-web..."#' \
  -e 's#^RUN cd shared #RUN cd apps/qdify/shared #' \
  -e 's#/qdify/web/dist#/qdify/apps/qdify/web/dist#' \
  apps/qdify/Dockerfile
```

### 6. Reinstall and check

```bash
pnpm install --no-frozen-lockfile
moon run :typecheck :lint :test :build
docker compose -f apps/qdify/compose.yaml --env-file apps/qdify/.env build
```

`git diff -M HEAD -- pnpm-lock.yaml apps/qdify/pnpm-lock.yaml` should show only the
`importers` paths changing, not package versions.

### 7. Update the docs

- `README.md`: `pnpm --dir apps/qdify install` becomes `pnpm install`, and the root is no
  longer language-neutral.
- `docs/monorepo.md`: rewrite the **Root** convention and the **pnpm workspaces** section,
  and remove `tags: [qdify-pnpm]` from the TypeScript example.
- `infra/aws/PLAN.md`: the CDK app joins the root workspace instead of making its own.

Commit this before adding the library, so the move can be reverted by itself.

## Add a library

This example creates `libs/example` and uses it from `qdify-api`. Replace `example` with
the real name.

### 1. Create it

```bash
mkdir -p libs/example/src

cat > libs/example/moon.yml <<'EOF'
id: example
language: typescript
layer: library
toolchains:
  default: system
EOF

cat > libs/example/package.json <<'EOF'
{
  "name": "@alice/example",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "devDependencies": {
    "@types/node": "catalog:",
    "oxlint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
EOF

cat > libs/example/tsconfig.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src"]
}
EOF

cat > libs/example/tsconfig.build.json <<'EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "declaration": true },
  "exclude": ["src/**/*.test.ts"]
}
EOF

cat > libs/example/src/index.ts <<'EOF'
export const example = () => 'example';
EOF

cat > libs/example/src/index.test.ts <<'EOF'
import { expect, it } from 'vitest';
import { example } from './index.js';

it('works', () => expect(example()).toBe('example'));
EOF
```

### 2. Link it to the consumer

pnpm and moon each need to be told. Without `dependsOn`, moon won't build the library
before the consumer.

```bash
pnpm --filter @alice/qdify-api add '@alice/example@workspace:*'
sed -i 's/^dependsOn: \[qdify-shared\]$/dependsOn: [qdify-shared, example]/' \
  apps/qdify/api/moon.yml
```

### 3. Add it to each image that ships it

The manifest is copied before the install, and the library is built before its consumers.

```bash
sed -i \
  -e '/^COPY apps\/qdify\/shared\/package.json /i COPY libs/example/package.json libs/example/' \
  -e '/^COPY apps\/qdify\/shared apps/i COPY libs/example libs/example' \
  -e '/^RUN cd apps\/qdify\/shared /i RUN cd libs/example \&\& pnpm exec tsc -p tsconfig.build.json' \
  apps/qdify/Dockerfile
```

### 4. Check

```bash
pnpm install
moon run :typecheck :lint :test :build
docker compose -f apps/qdify/compose.yaml --env-file apps/qdify/.env build
```

## If there are several workspaces by then

Do the same lift, with these additions:

- Merge every `catalog:` and `onlyBuiltDependencies` into the root file, and resolve
  version conflicts deliberately.
- Keep qdify's lockfile as the starting point and delete the others. The packages from
  those workspaces get re-resolved on install, so test them for version changes.
- Repeat steps 3 to 5 for each workspace: tsconfigs, moon tag files and Docker. There can
  be only one root `.dockerignore`, so either merge the allowlists or give each image a
  `<Dockerfile>.dockerignore` next to its Dockerfile.

## Going back

If the lift is its own commit and no library depends on it yet, `git revert` that commit,
delete the root `node_modules`, and run `pnpm --dir apps/qdify install`.

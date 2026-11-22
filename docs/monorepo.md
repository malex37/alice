# Adding a project

## Conventions

- **Location:** `apps/<app>/<component>`, `libs/<name>` or `infra/<name>`. A directory
  becomes a project when it has a `moon.yml`.
- **Id:** set it explicitly, as `<app>-<component>`.
- **Root:** keep it language-neutral. No `package.json`, lockfile or `node_modules`; those
  belong to the app that needs them.
- **Toolchains:** pin them in `.mise.toml`, as moon itself is. moon toolchain plugins aren't used, so every
  project sets `toolchains.default: system`.
- **Dependencies:** moon can't infer them without plugins. List each one in `dependsOn`,
  even if `package.json` already has it. `^:build` relies on this.
- **Task names:** `build`, `typecheck`, `test`, `lint`, `dev` (later `deploy`), so that
  `moon run :test` covers every language.
- **Inputs and outputs:** declare both, or caching will be wrong.

## Steps

1. Create the directory and its `moon.yml`.
2. Pin any new toolchain in `.mise.toml` and run `mise install`.
3. For a Node package, see [pnpm workspaces](#pnpm-workspaces).
4. Run `moon project <id>` to see what it inherited.
5. When a second project shares a language, move the common tasks to
   `.moon/tasks/<language>.yml` with `inheritedBy.languages`.

## pnpm workspaces

There is one workspace per app (or infra project), at `apps/<app>`, each with its own
lockfile.

- **New package in qdify:** add it to `apps/qdify/pnpm-workspace.yaml`, use `catalog:` for
  the shared tool versions, tag it `qdify-pnpm` in its `moon.yml`, then run
  `pnpm --dir apps/qdify install`. If the image needs it, also add it to
  `apps/qdify/.dockerignore` and the Dockerfile.
- **New workspace:** create `apps/<app>/pnpm-workspace.yaml`, then copy
  `.moon/tasks/qdify-pnpm.yml` to `<app>-pnpm.yml` with that app's paths and tag. Without
  it, lockfile changes won't invalidate moon's cache.
- **Across workspaces:** `workspace:*` doesn't reach another workspace. Use a `link:`
  dependency, install the linked package's own dependencies separately, and list it in
  `dependsOn`. If that stops scaling, follow [IN_CASE_OF_LIB.md](IN_CASE_OF_LIB.md) to
  move to a single root workspace.

## TypeScript

Tasks come from `.moon/tasks/typescript.yml`. Add `package.json`, `tsconfig.json` and
`tsconfig.build.json`.

```yaml
id: example-worker
language: typescript
tags: [qdify-pnpm]
toolchains:
  default: system
dependsOn: [qdify-shared]
```

## Python

Tasks come from `.moon/tasks/python.yml`. Add `requirements-dev.txt` with at least pytest
and ruff; `setup` creates the project's `.venv`.

```yaml
id: example-script
language: python
toolchains:
  default: system
```

## Android (Gradle)

Pin `java` in `.mise.toml`, commit the Gradle wrapper, and install the Android SDK.

```yaml
id: example-android
language: kotlin
toolchains:
  default: system
fileGroups:
  sources: ['app/src/**/*', '**/*.gradle.kts', 'gradle/**/*', 'gradle.properties']
tasks:
  build:
    command: ./gradlew assembleDebug
    inputs: ['@group(sources)']
    outputs: ['app/build/outputs']
  test:
    command: ./gradlew testDebugUnitTest
    inputs: ['@group(sources)']
  lint:
    command: ./gradlew lintDebug
    inputs: ['@group(sources)']
```

## iOS (xcodebuild)

Xcode can't be pinned by mise and only runs on macOS, hence `os: macos`.

```yaml
id: example-ios
language: swift
toolchains:
  default: system
fileGroups:
  sources: ['App/**/*', 'AppTests/**/*', 'App.xcodeproj/**/*']
tasks:
  build:
    command: >-
      xcodebuild build -project App.xcodeproj -scheme App
      -destination 'generic/platform=iOS Simulator' -derivedDataPath build
    inputs: ['@group(sources)']
    outputs: ['build/Build/Products']
    options:
      os: macos
  test:
    command: >-
      xcodebuild test -project App.xcodeproj -scheme App
      -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build
    inputs: ['@group(sources)']
    options:
      os: macos
```

## C++ (CMake)

Pin `cmake` and `ninja` in `.mise.toml`. The compiler comes from the OS.

```yaml
id: example-cpp
language: cplusplus
toolchains:
  default: system
fileGroups:
  sources: ['CMakeLists.txt', 'src/**/*', 'include/**/*', 'tests/**/*']
tasks:
  build:
    script: cmake -S . -B build -G Ninja && cmake --build build
    inputs: ['@group(sources)']
    outputs: ['build']
  test:
    command: ctest --test-dir build --output-on-failure
    deps: ['~:build']
    inputs: ['@group(sources)']
```

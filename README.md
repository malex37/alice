# Alice

Alice will be a monorepo for small personal apps, self-hosted at home or deployed to a private
AWS account.

It is meant to hold:

- **Apps**, each self-contained with its own language, dependencies, and container image.
- **Shared libraries**, added only when two apps need the same code.
- **Infrastructure as code** for anything that runs in AWS.

The repo uses more than one language. Each app chooses its own stack, and one task runner builds,
tests, and lints all of them. The first app is a small to-do service with a web UI and a Home
Assistant integration.

Work in progress happens on other branches, and they merge into `main` once they are ready.

# AWS plan

Status: **plan only**. There is no CDK code and nothing is deployed.

Decided: AWS CDK in TypeScript. Everything else here is a proposal.

## Hosting options

| Option | Storage | For | Against |
| --- | --- | --- | --- |
| **A. Lambda + API Gateway HTTP API, web on S3 + CloudFront** (recommended) | DynamoDB | No servers, next to no idle cost, managed TLS | Needs a Lambda entry point and a DynamoDB store; public endpoint |
| B. ECS Fargate running the existing image | DynamoDB | Same container as local | Always-on cost; a load balancer or tunnel for ingress |
| C. Small EC2 instance running compose | SQLite on EBS | No code changes; can be private over a VPN | A host to patch and back up |

With A, CloudFront routes `/api/*` to API Gateway so the web app stays on one origin and
needs no CORS. Choose C instead if qdify must never have a public endpoint.

## DynamoDB TaskStore

Implement `TaskStore` (`apps/qdify/api/src/store.ts`) and reuse `task-rules.ts`.

- Key: `pk = "TASKS"`, `sk = <task id>`. That is ample for one person's tasks and leaves
  room for `USER#<id>` later.
- `list`: strongly consistent Query, following pagination, then filter and sort in the
  store. A GSI isn't worth it at this size.
- `update`: read, apply the patch, then write conditionally on a `version` attribute and
  retry on conflict. SQLite gets this atomicity from being in-process; DynamoDB doesn't.
- `delete`: `ReturnValues: ALL_OLD` tells whether the task existed.
- On-demand billing, point-in-time recovery, `RemovalPolicy.RETAIN`.
- Select it with a new `QDIFY_STORE=sqlite|dynamodb` variable. Run the same tests against
  both stores, using DynamoDB Local.

## Stacks

- `QdifyData`: the table, with termination protection.
- `QdifyApp`: compute, ingress and web hosting, with least-privilege access to the table.

Keeping data separate means the app stack can be destroyed and recreated safely.

## Security before the first deploy

- Make the token mandatory. The API currently runs open when it is unset.
- Keep the token in SSM Parameter Store as a SecureString, read at runtime. Never put it
  in the template or CDK context.
- Throttle at the gateway and add a budget alarm.
- Deploy with short-lived credentials (IAM Identity Center), not access keys.

## Steps

1. Scaffold the CDK app here as its own pnpm workspace (see `docs/monorepo.md`), set
   `language: typescript`, and make `build` run `cdk synth`.
2. Add the DynamoDB store and shared store tests.
3. Add `QdifyData`, then `QdifyApp`.
4. Add a `deploy` task with `cache: false` and `runInCI: false`.
5. Export SQLite tasks and import them, then point Home Assistant at the new URL.

## Open questions

- Public endpoint with a token, or private only?
- Region, account and domain name?
- Does AWS replace local hosting? Running both would need sync, which isn't designed.

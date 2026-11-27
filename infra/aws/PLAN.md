# AWS plan

Status: **plan only**. There is no CDK code and nothing is deployed.

Decided: AWS CDK in TypeScript. Everything else here is a proposal.

## Hosting options

| Option                                                                     | Storage  | For                                                | Against                                               |
| -------------------------------------------------------------------------- | -------- | -------------------------------------------------- | ----------------------------------------------------- |
| **A. Lambda + API Gateway HTTP API, web on S3 + CloudFront** (recommended) | DynamoDB | No servers, next to no idle cost, managed TLS      | Needs a Lambda entry point; public endpoint           |
| B. ECS Fargate running the existing image                                  | DynamoDB | Same container as local                            | Always-on cost; a load balancer or tunnel for ingress |
| C. Small EC2 instance running the image                                    | DynamoDB | Same container as local; can be private over a VPN | A host to patch                                       |

With A, CloudFront routes `/api/*` to API Gateway so the web app stays on one origin and
needs no CORS. Choose C instead if qdify must never have a public endpoint.

## DynamoDB TaskStore

Done: `apps/qdify/api/src/dynamodb-store.ts`. Locally it runs against MiniStack; in AWS,
leave `QDIFY_DYNAMODB_ENDPOINT` unset and set `QDIFY_DYNAMODB_TABLE` and `AWS_REGION`.

- Key: `pk = "TASKS"`, `sk = <task id>`. Ample for one person's tasks, with room for
  `USER#<id>` later.
- `list` is a strongly consistent Query, filtered and sorted in the store; no GSI.
- `update` writes conditionally on a `version` attribute and retries on conflict.
- The app creates the table only against an emulator. In AWS, `QdifyData` owns it: on-demand
  billing, point-in-time recovery, `RemovalPolicy.RETAIN`, and the key schema above.
- The role needs `GetItem`, `PutItem`, `DeleteItem` and `Query` on the table, and nothing else.

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
2. Add `QdifyData`, then `QdifyApp`.
3. Add a `deploy` task with `cache: false` and `runInCI: false`.
4. Copy the tasks from MiniStack into the new table, then point Home Assistant at the new
   URL.

## Open questions

- Public endpoint with a token, or private only?
- Region, account and domain name?
- Does AWS replace local hosting? Running both would need sync, which isn't designed.

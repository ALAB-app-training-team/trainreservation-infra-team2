// infra/bin/app.ts
import { App } from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";
import { DbStack } from "../lib/db-stack";
import { EcrStack } from "../lib/ecr-stack";
import { BackendStack } from "../lib/backend-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { SchedulerStack } from "../lib/scheduler-stack";

const app = new App();
const APP_NAME = app.node.tryGetContext("APP_NAME") || "sample-app"; // プロジェクト名を指定(package.jsonと合わせる)
const ENV = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "ap-northeast-1",
};

const vpc = new VpcStack(app, `${APP_NAME}-vpc`, {
  env: ENV,
  appName: APP_NAME,
});
const db = new DbStack(app, `${APP_NAME}-db`, {
  env: ENV,
  appName: APP_NAME,
  vpc: vpc.vpc,
  dbSg: vpc.dbSg,
});
new FrontendStack(app, `${APP_NAME}-fe`, { env: ENV, appName: APP_NAME });

const ecr = new EcrStack(app, `${APP_NAME}-ecr`, {
  env: ENV,
  appName: APP_NAME,
});

const CREATE_BE_SERVICE =
  app.node.tryGetContext("CREATE_BE_SERVICE") === "true";
const be = new BackendStack(app, `${APP_NAME}-be`, {
  env: ENV,
  appName: APP_NAME,
  vpc: vpc.vpc,
  db: db.db,
  dbSecret: db.secret,
  beSg: vpc.beSg,
  repo: ecr.repo,
  createService: CREATE_BE_SERVICE, // ← 追加フラグ
});

const ENABLE_SCHEDULE = app.node.tryGetContext("ENABLE_SCHEDULE") === "true";
const SCHEDULE_WEEKDAYS_ONLY =
  app.node.tryGetContext("SCHEDULE_WEEKDAYS_ONLY") === "true";
new SchedulerStack(app, `${APP_NAME}-schedule`, {
  env: ENV,
  enabled: ENABLE_SCHEDULE,
  weekdaysOnly: SCHEDULE_WEEKDAYS_ONLY,
  dbInstanceIdentifier: db.db.instanceIdentifier,
  appRunnerServiceArn: be.appRunnerServiceArn,
});

import { Stack, StackProps, ArnFormat } from "aws-cdk-lib";
import { Construct } from "constructs";
import { CfnSchedule } from "aws-cdk-lib/aws-scheduler";
import { Role, ServicePrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";

export class SchedulerStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      dbInstanceIdentifier: string;
      appRunnerServiceArn?: string;
      enabled?: boolean;
      timeZone?: string;
      stopHourJst?: number;
      startHourJst?: number;
      weekdaysOnly?: boolean;
    }
  ) {
    super(scope, id, props);

    if (!props.enabled) return;

    const timeZone = props.timeZone ?? "Asia/Tokyo";
    const stopHour = props.stopHourJst ?? 20;
    const startHour = props.startHourJst ?? 8;
    const weekdaysOnly = props.weekdaysOnly ?? false;

    const dailyCron = (hour: number) => `cron(0 ${hour} * * ? *)`;
    const weekdaysCron = (hour: number) => `cron(0 ${hour} ? * MON-FRI *)`;
    const startCron = weekdaysOnly ? weekdaysCron(startHour) : dailyCron(startHour);

    const schedulerRole = new Role(this, "SchedulerRole", {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com"),
    });

    const dbArn = Stack.of(this).formatArn({
      service: "rds",
      resource: "db",
      resourceName: props.dbInstanceIdentifier,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });

    schedulerRole.addToPolicy(
      new PolicyStatement({
        actions: ["rds:StopDBInstance", "rds:StartDBInstance"],
        resources: [dbArn],
      })
    );

    if (props.appRunnerServiceArn) {
      schedulerRole.addToPolicy(
        new PolicyStatement({
          actions: ["apprunner:PauseService", "apprunner:ResumeService"],
          resources: [props.appRunnerServiceArn],
        })
      );
    }

    // RDS: stop at 20:00 JST everyday
    new CfnSchedule(this, "StopRdsDaily", {
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: dailyCron(stopHour),
      scheduleExpressionTimezone: timeZone,
      target: {
        arn: "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance",
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          DBInstanceIdentifier: props.dbInstanceIdentifier,
        }),
      },
    });

    // RDS: start at 08:00 JST (optionally weekdays only)
    new CfnSchedule(this, "StartRdsDaily", {
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: startCron,
      scheduleExpressionTimezone: timeZone,
      target: {
        arn: "arn:aws:scheduler:::aws-sdk:rds:startDBInstance",
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          DBInstanceIdentifier: props.dbInstanceIdentifier,
        }),
      },
    });

    if (props.appRunnerServiceArn) {
      // App Runner: pause at 20:00 JST everyday
      new CfnSchedule(this, "PauseAppRunnerDaily", {
        flexibleTimeWindow: { mode: "OFF" },
        scheduleExpression: dailyCron(stopHour),
        scheduleExpressionTimezone: timeZone,
        target: {
          arn: "arn:aws:scheduler:::aws-sdk:apprunner:pauseService",
          roleArn: schedulerRole.roleArn,
          input: JSON.stringify({
            ServiceArn: props.appRunnerServiceArn,
          }),
        },
      });

      // App Runner: resume at 08:00 JST (optionally weekdays only)
      new CfnSchedule(this, "ResumeAppRunnerDaily", {
        flexibleTimeWindow: { mode: "OFF" },
        scheduleExpression: startCron,
        scheduleExpressionTimezone: timeZone,
        target: {
          arn: "arn:aws:scheduler:::aws-sdk:apprunner:resumeService",
          roleArn: schedulerRole.roleArn,
          input: JSON.stringify({
            ServiceArn: props.appRunnerServiceArn,
          }),
        },
      });
    }
  }
}

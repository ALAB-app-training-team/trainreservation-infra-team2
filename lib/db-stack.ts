import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Vpc,
  SecurityGroup,
  SubnetType,
  InstanceType,
  InstanceClass,
  InstanceSize,
} from "aws-cdk-lib/aws-ec2";
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  Credentials,
  StorageType,
} from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";

export class DbStack extends Stack {
  public readonly db: DatabaseInstance;
  public readonly secret: ISecret;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { appName: string; vpc: Vpc; dbSg: SecurityGroup }
  ) {
    super(scope, id, props);

    const backupRetentionDaysRaw = this.node.tryGetContext(
      "DB_BACKUP_RETENTION_DAYS"
    );
    const backupRetentionDays = Number(
      backupRetentionDaysRaw ?? 1
    );
    const backupRetention = Number.isFinite(backupRetentionDays)
      ? Duration.days(Math.max(1, Math.floor(backupRetentionDays)))
      : Duration.days(1);

    this.db = new DatabaseInstance(this, "Postgres", {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.dbSg],
      instanceIdentifier: `${props.appName}-postgres`,
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_16_6,
      }),
      // Secret Manager にユーザー名・パスワードを保存
      // パスワードはランダムな値が自動生成される(AWSコンソールで確認可能)
      credentials: Credentials.fromGeneratedSecret("appuser", {
        secretName: `${props.appName}/db`,
      }),
      allocatedStorage: 20,
      storageType: StorageType.GP3,
      storageEncrypted: true,
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      publiclyAccessible: false,
      multiAz: false,
      backupRetention,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
      deleteAutomatedBackups: true,
    });

    this.secret = this.db.secret!;

    new CfnOutput(this, "DbEndpoint", {
      value: this.db.dbInstanceEndpointAddress,
    });
  }
}

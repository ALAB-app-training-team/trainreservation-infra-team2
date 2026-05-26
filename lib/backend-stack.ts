// infra/lib/backend-stack.ts
import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { CfnService, CfnVpcConnector } from "aws-cdk-lib/aws-apprunner";
import { DatabaseInstance } from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import {
  Role,
  ServicePrincipal,
  ManagedPolicy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";

export class BackendStack extends Stack {
  public readonly appRunnerServiceArn?: string;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      appName: string;
      vpc: Vpc;
      db: DatabaseInstance;
      dbSecret: ISecret;
      beSg: SecurityGroup;
      repo: Repository;
      createService?: boolean;
    }
  ) {
    super(scope, id, props);
    const appName = props.appName;

    const repo = props.repo;

    // ★ VPC Connector （BE SG をそのまま利用）
    const subnets = props.vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_ISOLATED,
    }).subnetIds;
    const vpcConn = new CfnVpcConnector(this, "VpcConnector", {
      subnets,
      securityGroups: [props.beSg.securityGroupId],
      vpcConnectorName: `${appName}-connector`,
    });

    // App Runner 実行ロール（ECR Pull・Secrets参照）
    const execRole = new Role(this, "AppRunnerEcrAccessRole", {
      assumedBy: new ServicePrincipal("build.apprunner.amazonaws.com"),
    });
    execRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSAppRunnerServicePolicyForECRAccess"
      )
    );

    // ランタイムロール（Secrets参照）
    const runtimeRole = new Role(this, "AppRunnerRuntimeRole", {
      assumedBy: new ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });
    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [props.dbSecret.secretArn],
      })
    );

    if (props.createService) {
      const svc = new CfnService(this, "Service", {
        serviceName: `${appName}-backend`,
        sourceConfiguration: {
          authenticationConfiguration: { accessRoleArn: execRole.roleArn },
          imageRepository: {
            imageIdentifier: `${repo.repositoryUri}:latest`,
            imageRepositoryType: "ECR",
            imageConfiguration: {
              port: "8080",
              runtimeEnvironmentVariables: [
                {
                  name: "DB_ENDPOINT",
                  value: props.db.dbInstanceEndpointAddress,
                },
                { name: "DB_NAME", value: "postgres" },
              ],
              runtimeEnvironmentSecrets: [
                { name: "DB_SECRET_JSON", value: props.dbSecret.secretArn },
              ],
            },
          },
          autoDeploymentsEnabled: false,
        },
        instanceConfiguration: {
          cpu: "0.25 vCPU",
          memory: "0.5 GB",
          instanceRoleArn: runtimeRole.roleArn,
        },
        networkConfiguration: {
          egressConfiguration: {
            egressType: "VPC",
            vpcConnectorArn: vpcConn.attrVpcConnectorArn,
          },
        },
        healthCheckConfiguration: {
          protocol: "TCP",
          interval: 10,
          timeout: 5,
          healthyThreshold: 1,
          unhealthyThreshold: 5,
        },
      });
      this.appRunnerServiceArn = svc.attrServiceArn;
      new CfnOutput(this, "AppRunnerServiceArn", { value: svc.attrServiceArn });
      new CfnOutput(this, "AppRunnerServiceUrl", { value: svc.attrServiceUrl });
    }
  }
}

// infra/lib/vpc-stack.ts
import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Vpc,
  SubnetType,
  SecurityGroup,
  CfnSecurityGroupIngress,
  IpAddresses,
} from "aws-cdk-lib/aws-ec2";

export class VpcStack extends Stack {
  public readonly vpc: Vpc;
  public readonly beSg: SecurityGroup;
  public readonly dbSg: SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { appName: string }
  ) {
    super(scope, id, props);

    const vpcCidr = this.node.tryGetContext("VPC_CIDR") || "10.110.0.0/24";

    this.vpc = new Vpc(this, "Vpc", {
      vpcName: `${props.appName}-vpc`,
      ipAddresses: IpAddresses.cidr(vpcCidr),
      natGateways: 0,
      subnetConfiguration: [
        {
          name: `${props.appName}-private-1`,
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
        {
          name: `${props.appName}-private-2`,
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
      ],
    });

    // ★ Backend用 SG（App Runner VPCコネクタが付く）
    this.beSg = new SecurityGroup(this, "BeSg", {
      vpc: this.vpc,
      allowAllOutbound: true,
    });

    // ★ DB用 SG
    this.dbSg = new SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      allowAllOutbound: true,
    });

    // ★ 5432/TCP を BE→DB に許可（IngressリソースをVPCスタックに置く）
    new CfnSecurityGroupIngress(this, "BeToDb5432", {
      groupId: this.dbSg.securityGroupId, // 受け側(DB)
      sourceSecurityGroupId: this.beSg.securityGroupId, // 送り側(BE)
      ipProtocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      description: "AppRunner to RDS PostgreSQL",
    });

    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}

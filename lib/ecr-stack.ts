import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Repository, TagStatus } from "aws-cdk-lib/aws-ecr";

export class EcrStack extends Stack {
  public readonly repo: Repository;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      appName: string;
    }
  ) {
    super(scope, id, props);

    this.repo = new Repository(this, "Repo", {
      repositoryName: props.appName,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
    });

    // コスト抑制: 溜まりがちなイメージを自動削除
    this.repo.addLifecycleRule({
      description: "Expire untagged images after 7 days",
      tagStatus: TagStatus.UNTAGGED,
      maxImageAge: Duration.days(7),
    });
    this.repo.addLifecycleRule({
      description: "Keep last 30 tagged images",
      tagStatus: TagStatus.TAGGED,
      maxImageCount: 30,
    });

    new CfnOutput(this, "EcrRepoName", { value: this.repo.repositoryName });
    new CfnOutput(this, "EcrRepoUri", { value: this.repo.repositoryUri });
  }
}

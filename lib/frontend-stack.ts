import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";

export class FrontendStack extends Stack {
  public readonly dist: Distribution;

  constructor(scope: Construct, id: string, props: StackProps & { appName: string }) {
    super(scope, id, props);

    const bucket = new Bucket(this, "WebBucket", {
      bucketName: `${props.appName}-web-${this.account}-${this.region}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.dist = new Distribution(this, "Cdn", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.seconds(0) },
      ],
    });

    new CfnOutput(this, "WebBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "CloudFrontUrl", { value: `https://${this.dist.domainName}` });
  }
}
# terraform-aws-static-site

Terraform module for a static website on AWS: private S3 + CloudFront (OAC) + ACM + Route53. Single CloudFront distribution handles both the apex domain and www subdomain.

## Features

- Private S3 bucket — only CloudFront can read it (Origin Access Control)
- Single CloudFront distribution for both `example.com` and `www.example.com`
- Automatic apex → www redirect via CloudFront Function (no second distribution needed)
- Directory-style URLs: `/about` and `/about/` both serve `/about/index.html`
- ACM certificate with DNS validation (covers apex + www)
- GitHub Actions deploy role via OIDC — no long-lived AWS keys

## Prerequisites

- Terraform >= 1.5.0
- AWS provider >= 5.0
- Route53 hosted zone for your domain already exists
- GitHub OIDC provider created in your AWS account (one-time per account):
  ```
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
  ```

## Usage

```hcl
module "site" {
  source = "github.com/seanlh/terraform-aws-static-site?ref=v1.0.0"

  domain         = "example.com"
  hosted_zone_id = "Z1234567890ABC"
  github_repo    = "seanlh/example.com"

  tags = {
    Site = "example.com"
  }
}

output "deploy_role_arn"           { value = module.site.deploy_role_arn }
output "s3_bucket_name"            { value = module.site.s3_bucket_name }
output "cloudfront_distribution_id" { value = module.site.cloudfront_distribution_id }
```

## Inputs

| Name | Description | Default |
|---|---|---|
| `domain` | Root domain (e.g. `seanlh.com`) | required |
| `hosted_zone_id` | Route53 hosted zone ID | required |
| `github_repo` | GitHub repo in `owner/repo` format | required |
| `price_class` | CloudFront price class | `PriceClass_100` |
| `tags` | Tags applied to all resources | `{}` |

## Outputs

| Name | Description |
|---|---|
| `s3_bucket_name` | S3 bucket name — set as `S3_BUCKET` GitHub secret |
| `cloudfront_distribution_id` | CloudFront distribution ID — set as `CF_DISTRIBUTION_ID` GitHub secret |
| `cloudfront_domain` | `*.cloudfront.net` domain for verification |
| `deploy_role_arn` | IAM role ARN — set as `AWS_DEPLOY_ROLE_ARN` GitHub secret |

## After `terraform apply`

Set these three secrets in your site repo (Settings → Secrets → Actions):

```
AWS_DEPLOY_ROLE_ARN   = $(terraform output -raw deploy_role_arn)
S3_BUCKET             = $(terraform output -raw s3_bucket_name)
CF_DISTRIBUTION_ID    = $(terraform output -raw cloudfront_distribution_id)
```

## Tests

CloudFront Function logic is unit-tested. Requires Node.js or Bun:

```
node function.test.js
# or
bun function.test.js
```

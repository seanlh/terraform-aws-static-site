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

## Importing an existing domain

If your domain already has Route53 records, an ACM cert, or old CloudFront distributions, use Terraform import blocks (Terraform 1.5+) to bring them under management rather than recreating them.

Create an `imports.tf` alongside your `main.tf`:

```hcl
import {
  to = aws_route53_zone.main
  id = "Z1234567890ABC"   # your hosted zone ID
}

import {
  to = module.site.aws_route53_record.apex_a
  id = "Z1234567890ABC_example.com_A"
}

import {
  to = module.site.aws_route53_record.www_a
  id = "Z1234567890ABC_www.example.com_A"
}

# ACM certificate
import {
  to = module.site.aws_acm_certificate.site
  id = "arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}

# DNS validation CNAME records (one per domain name on the cert)
import {
  to = module.site.aws_route53_record.cert_validation["example.com"]
  id = "Z1234567890ABC__abc123.example.com._CNAME"
}

import {
  to = module.site.aws_route53_record.cert_validation["www.example.com"]
  id = "Z1234567890ABC__def456.www.example.com._CNAME"
}
```

Run `terraform plan` to verify, then `terraform apply`. After a clean apply, **delete `imports.tf`** — import blocks are one-time and will error on re-apply.

### Finding the IDs

```bash
# Hosted zone ID
aws route53 list-hosted-zones --query 'HostedZones[?Name==`example.com.`].Id' --output text

# ACM certificate ARN (must be in us-east-1 for CloudFront)
aws acm list-certificates --region us-east-1 \
  --query 'CertificateSummaryList[?DomainName==`example.com`].CertificateArn' --output text

# Cert validation CNAME record IDs (format: ZONEID_NAME_TYPE)
aws route53 list-resource-record-sets --hosted-zone-id Z1234567890ABC \
  --query 'ResourceRecordSets[?Type==`CNAME`].[Name,Type]' --output text
```

## Migrating from old CloudFront distributions

If you previously had CloudFront distributions serving the domain, you need to clear their CNAME aliases before `terraform apply` or it fails with `CNAMEAlreadyExists`.

```bash
# Get the current config
aws cloudfront get-distribution-config --id OLD_DIST_ID > /tmp/old-config.json
ETAG=$(aws cloudfront get-distribution-config --id OLD_DIST_ID --query 'ETag' --output text)

# Edit the config to remove CNAMEs: set "Aliases": {"Quantity": 0}
# (or use jq/python to patch programmatically)

aws cloudfront update-distribution \
  --id OLD_DIST_ID \
  --distribution-config file:///tmp/old-config-patched.json \
  --if-match "$ETAG"
```

After aliases are cleared, `terraform apply` will create the new distribution and DNS records without conflict.

### Deleting old distributions

Once the new distribution is live, disable the old ones before deleting:

1. Update the distribution config with `"Enabled": false` and apply it.
2. Wait for `Status: Deployed` (`aws cloudfront wait distribution-deployed --id OLD_DIST_ID`).
3. Delete: `aws cloudfront delete-distribution --id OLD_DIST_ID --if-match $(aws cloudfront get-distribution-config --id OLD_DIST_ID --query ETag --output text)`

**WAF pricing plan blocker:** If CloudFront auto-created WAF web ACLs with managed rules for your old distributions (visible as `CreatedByCloudFront-*` in the WAF console), deletion will fail with `PreconditionFailed: You can't delete this distribution while it's subscribed to a pricing plan`. To resolve:

1. Strip the managed rules from the WAF ACL to stop per-rule charges while you wait:
   ```bash
   LOCK=$(aws wafv2 get-web-acl --name NAME --id ID --scope CLOUDFRONT --region us-east-1 --query LockToken --output text)
   aws wafv2 update-web-acl --name NAME --id ID --scope CLOUDFRONT --region us-east-1 \
     --default-action Allow={} --rules '[]' \
     --visibility-config SampledRequestsEnabled=false,CloudWatchMetricsEnabled=false,MetricName=NAME \
     --lock-token "$LOCK"
   ```
2. Cancel the pricing plan subscription via the CloudFront Console (distribution → Security tab).
3. After the billing cycle ends, delete the distribution and then the WAF ACL.

## Tests

CloudFront Function logic is unit-tested. Requires Node.js or Bun:

```
node function.test.js
# or
bun function.test.js
```

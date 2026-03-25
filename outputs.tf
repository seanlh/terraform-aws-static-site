output "s3_bucket_name" {
  description = "Name of the S3 bucket serving the site content."
  value       = aws_s3_bucket.site.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — needed for cache invalidation in GitHub Actions."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain" {
  description = "CloudFront *.cloudfront.net domain — useful for verification."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "deploy_role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes for deploy. Set as AWS_DEPLOY_ROLE_ARN secret."
  value       = aws_iam_role.deploy.arn
}

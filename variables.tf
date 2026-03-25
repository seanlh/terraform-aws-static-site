variable "domain" {
  description = "Root domain name (e.g. seanlh.com). The module manages both <domain> and www.<domain>."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for the domain."
  type        = string
}

variable "github_repo" {
  description = "GitHub repo that deploys this site, in owner/repo format (e.g. seanlh/seanlh.com). Used to scope the OIDC deploy role."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 = US+Europe (cheapest). PriceClass_All = global."
  type        = string
  default     = "PriceClass_100"
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}

variable "metronome_api_key" {}
variable "region" {
    default     = "us-west-2"
    type = string
    description = "AWS Region to deploy to"
}

variable "ingest_bucket" {
    default     = "metronome-ingest"
    type = string
    description = "S3 bucket source for events"
}

variable "logs_bucket" {
    default     = "metronome-logs"
    type = string
    description = "S3 bucket to store logs"
}

variable "lambda_node_version" {
    type = string
    default = "nodejs20.x"
}

variable "store_only_errors" {
    type = string
    default = "false"
}

variable "cloud_watch_retention_days" {
  type = number
  default = 1
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
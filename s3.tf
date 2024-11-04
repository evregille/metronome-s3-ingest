
# S3 Bucket for Event ingested
resource "aws_s3_bucket" "ingest_bucket" {
  bucket = var.ingest_bucket
  force_destroy = true
}
resource "aws_s3_bucket_ownership_controls" "ingest_ownership" {
    bucket = aws_s3_bucket.ingest_bucket.id
    rule {
        object_ownership = "BucketOwnerEnforced"
    }
}

# S3 Bucket for logging errors
resource "aws_s3_bucket" "logs_bucket" {
  bucket = var.logs_bucket
  force_destroy = true
}
resource "aws_s3_bucket_ownership_controls" "logs_ownership" {
    bucket = aws_s3_bucket.logs_bucket.id
    rule {
        object_ownership = "BucketOwnerEnforced"
    }
}
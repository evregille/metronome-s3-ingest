## LAMBDA INGEST ----------
# transpiler typescript 
resource "terraform_data" "transpile_ingest" {
  triggers_replace = [local.lambda_ingest__md5]
  provisioner "local-exec" {
    command     = "npm run build"
    working_dir = "./src/lambdas/ingest"
  }
}
locals {
  lambda_ingest__md5 = filemd5("./src/lambdas/ingest/index.ts")
}

# create the zip file
data "archive_file" "ingest" {
    type = "zip"
    source_dir = "./src/lambdas/ingest"
    output_path = "./src/lambdas/ingest.zip"

    depends_on = [terraform_data.transpile_ingest]
}

# create lambda
resource "aws_lambda_function" "ingest" {
  filename         = data.archive_file.ingest.output_path
  function_name    = "metronome-ingest-function"
  handler          = "index.handler"
  runtime          = var.lambda_node_version
  role             = aws_iam_role.ingest.arn
  memory_size      = "128"
  timeout          = "15"
  source_code_hash = data.archive_file.ingest.output_base64sha256
  environment {
    variables = {
      STORE_ONLY_ERRORS = var.store_only_errors
      SQS_LOG_QUEUE_URL = aws_sqs_queue.logs_queue.url
      SQS_INGEST_QUEUE_URL= aws_sqs_queue.ingest_queue.url
    }
  }
}

# A Cloudwatch Log Group
resource "aws_cloudwatch_log_group" "ingest" {
  name = "/aws/lambda/${aws_lambda_function.ingest.function_name}"
  retention_in_days = var.cloud_watch_retention_days
}

# Notification for objects created in ingest S3 bucket
resource "aws_lambda_permission" "allow_bucket" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.ingest_bucket.arn
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.ingest_bucket.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.ingest.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".json"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.ingest.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".jsonl"
  }
  
  lambda_function {
    lambda_function_arn = aws_lambda_function.ingest.arn
    events              = ["s3:ObjectCreated:*"]
    filter_suffix       = ".csv"
  }

  depends_on = [aws_lambda_permission.allow_bucket]
}

# LAMBDA TO POST EVENTS TO METRONOME ---------------------
# transpiler 
resource "terraform_data" "transpile_post_events" {
  triggers_replace = [local.lambda_post__md5]
  provisioner "local-exec" {
    command     = "npm run build"
    working_dir = "./src/lambdas/post_events"
  }
}
locals {
  lambda_post__md5 = filemd5("./src/lambdas/post_events/index.ts")
}

# create the zip file
data "archive_file" "post_events" {
    type = "zip"
    source_dir = "./src/lambdas/post_events"
    output_path = "./src/lambdas/post_events.zip"

    depends_on = [ terraform_data.transpile_post_events ]
}

# create lambda
resource "aws_lambda_function" "post_events" {
  filename         = data.archive_file.post_events.output_path
  function_name    = "metronome-post_events-function"
  handler          = "index.handler"
  runtime          = var.lambda_node_version
  role             = aws_iam_role.post_events.arn
  memory_size      = "256"
  timeout          = "10"
  source_code_hash = data.archive_file.post_events.output_base64sha256
  environment {
    variables = {
      METRONOME_API_KEY = var.metronome_api_key
      SQS_QUEUE_URL = aws_sqs_queue.logs_queue.url
      STORE_ONLY_ERRORS = var.store_only_errors
    }
  }
}

# A Cloudwatch Log Group
resource "aws_cloudwatch_log_group" "post_events" {
  name = "/aws/lambda/${aws_lambda_function.post_events.function_name}"
  retention_in_days = var.cloud_watch_retention_days
}

# LAMBDA TO LOG LOGS ----------------------------------
# transpiler 
resource "terraform_data" "transpile_logs" {
  triggers_replace = [local.lambda_logs__md5]
  provisioner "local-exec" {
    command     = "npm run build"
    working_dir = "./src/lambdas/logs"
  }
}
locals {
  lambda_logs__md5 = filemd5("./src/lambdas/logs/index.ts")
}

# create the zip file
data "archive_file" "logs" {
    type = "zip"
    source_dir = "./src/lambdas/logs"
    output_path = "./src/lambdas/logs.zip"

    depends_on = [terraform_data.transpile_logs]
}

# create lambda
resource "aws_lambda_function" "logs" {
  filename         = data.archive_file.logs.output_path
  function_name    = "metronome-logs-function"
  handler          = "index.handler"
  runtime          = var.lambda_node_version
  role             = aws_iam_role.logs.arn
  memory_size      = "128"
  timeout          = "3"
  source_code_hash = data.archive_file.logs.output_base64sha256
  environment {
    variables = {
      S3_BUCKET_LOGS = var.logs_bucket    
    }
  }
}

# A Cloudwatch Log Group
resource "aws_cloudwatch_log_group" "cw-metronome-logs" {
  name = "/aws/lambda/${aws_lambda_function.logs.function_name}"
  retention_in_days = var.cloud_watch_retention_days
}

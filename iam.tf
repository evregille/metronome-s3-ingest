resource "aws_iam_role" "logs" {
  name = "metronome-lambda-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
    }]
  })
}

resource "aws_iam_role" "ingest" {
  name = "metronome-lambda-ingest-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
    }]
  })
}

resource "aws_iam_role" "post_events" {
  name = "metronome-lambda-post-events-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
    }]
  })
}

// Lambda additional role to invoke another lambda from ingest lambda
resource "aws_iam_policy_attachment" "policy_invoke_for_lambda" {
  name = "invoke-lambda"
  roles       = [ aws_iam_role.ingest.name ]
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaRole"
}

resource "aws_iam_policy_attachment" "lambda_basic_execution" {
  name       = "basic-execution-role"
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  roles      = [ aws_iam_role.ingest.name,  aws_iam_role.post_events.name,  aws_iam_role.logs.name]
}

# SQS - SendMessage permission for ingest and post_events lambdas
data "aws_iam_policy_document" "sqs_send_msg" {
  statement {
    sid       = "PostEventsSendMessage"
    actions   = [
      "sqs:SendMessage",
    ]
    resources = [
      aws_sqs_queue.logs_queue.arn
    ]
  }
}

resource "aws_iam_policy" "sqs_send_msg" {
  name   = "policy_sqs_send_msg"
  policy = data.aws_iam_policy_document.sqs_send_msg.json
}

resource "aws_iam_role_policy_attachment" "ingest" {
  role       = aws_iam_role.ingest.name
  policy_arn = aws_iam_policy.sqs_send_msg.arn
}

resource "aws_iam_role_policy_attachment" "post_events" {
  role       = aws_iam_role.post_events.name
  policy_arn = aws_iam_policy.sqs_send_msg.arn
}

# SQS - Read messages for the log lambda function
data "aws_iam_policy_document" "logs" {
  statement {
    sid       = "LogsReceiveMessage"
    actions   = [
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes"
    ]
    resources = [
      aws_sqs_queue.logs_queue.arn
    ]
  }
}

resource "aws_iam_policy" "logs" {
  name   = "policy_sqs_logs"
  policy = data.aws_iam_policy_document.logs.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.logs.name
  policy_arn = aws_iam_policy.logs.arn
}



# S3 - read access to the s3 bucket ingest for our lambda arn
resource "aws_s3_bucket_policy" "ingest" {
  bucket = var.ingest_bucket

  policy = jsonencode({
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "AWS": ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${aws_iam_role.ingest.name}" ]
        },
        "Action": [
          "s3:GetObject"
        ],
        "Resource": [
          "arn:aws:s3:::${var.ingest_bucket}",
          "arn:aws:s3:::${var.ingest_bucket}/*"
        ]
      }
    ]
  })
}

# S3 - write access to the s3 bucket logs for our lambda log arn
resource "aws_s3_bucket_policy" "logs" {
  bucket = var.logs_bucket

  policy = jsonencode({
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${aws_iam_role.logs.name}"
        },
        "Action": [
          "s3:PutObject"
        ],
        "Resource": [
          "arn:aws:s3:::${var.logs_bucket}",
          "arn:aws:s3:::${var.logs_bucket}/*"
        ]
      }
    ]
  })
}

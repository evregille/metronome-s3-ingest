# SQS queue + DLQ
resource "aws_sqs_queue" "logs_queue" {
  name                      = "metronome-ingest-logs"
  delay_seconds             = 0
  max_message_size          = 262144 // 256KB
  message_retention_seconds = 86400
  receive_wait_time_seconds = 3
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.deadletter_queue.arn
    maxReceiveCount     = 3
  })
}


resource "aws_sqs_queue" "deadletter_queue" {
  name = "metronome-ingest-deadletter-queue"
}

resource "aws_sqs_queue_redrive_allow_policy" "terraform_queue_redrive_allow_policy" {
  queue_url = aws_sqs_queue.deadletter_queue.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue",
    sourceQueueArns   = [aws_sqs_queue.logs_queue.arn]
  })
}

resource "aws_lambda_event_source_mapping" "logs" {
  event_source_arn = aws_sqs_queue.logs_queue.arn
  function_name    = aws_lambda_function.logs.arn
}
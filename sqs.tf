# SQS queue for Ingest
resource "aws_sqs_queue" "ingest_queue" {
  name                      = "metronome-ingest"
  delay_seconds             = 0
  max_message_size          = 262144 // 256KB
  message_retention_seconds = 86400
  receive_wait_time_seconds = 3
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.deadletter_queue.arn
    maxReceiveCount     = 3
  })
}

# trigger messages posted on ingest queue 
resource "aws_lambda_event_source_mapping" "post_events" {
  event_source_arn = aws_sqs_queue.ingest_queue.arn
  function_name    = aws_lambda_function.post_events.arn
}

# dead queue
resource "aws_sqs_queue" "deadletter_queue" {
  name = "metronome-ingest-deadletter-queue"
  delay_seconds             = 0
  max_message_size          = 262144 // 256KB
  message_retention_seconds = 86400
  receive_wait_time_seconds = 3
}

resource "aws_sqs_queue_redrive_allow_policy" "terraform_queue_redrive_allow_policy" {
  queue_url = aws_sqs_queue.deadletter_queue.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue",
    sourceQueueArns   = [aws_sqs_queue.ingest_queue.arn]
  })
}

# trigger for the dead queue
resource "aws_lambda_event_source_mapping" "logs" {
  event_source_arn = aws_sqs_queue.deadletter_queue.arn
  function_name    = aws_lambda_function.logs.arn
}
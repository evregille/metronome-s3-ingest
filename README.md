# Metronome S3 Ingest 
Automatically ingest events into Metronome from files stored in a S3 bucket in following formats:
- .json
- .csv 
- .jsonl (coming soon)

It uses AWS S3 trigger to invoke the `ingest` lambda function. It logs errors into an S3 bucket via a SQS.

![overview](./ingest-overview.png?raw=true "overview")

Each event is required to have the following properties: `timestamp`, `customer_id`, `transaction_id` and `event_type`. In case of CSV file, events properties should be provided as event attributes and the ingest function will set them up as `properties` on the event object. For example your csv should look like this

```bash
timestamp,transaction_id,customer_id,event_type,cloud_name,tokens_type,count_tokens
2024-11-01T23:59:00+00:00,123_abc,customer_a1,tokens,AWS,input,5640
2024-11-01T23:59:00+00:00,456_abc,customer_a2,tokens,AWS,output,56402
```

# How to deploy
## configure 
In the `variable.tf` you can set the Terraform inputs like S3 bucket names and cloud watch logs retention.

Create a file `terraform.tfvars` in the root folder with the following content
```bash
metronome_api_key = "YOUR_METRONOME_API_KEY"
```

## deploy
Run the following command to deploy the AWS resources
```bash
AWS_ACCESS_KEY=YOURKEY AWS_SECRET_ACCESS_KEY=YOURSECRET terraform apply
```


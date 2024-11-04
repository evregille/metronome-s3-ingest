# Metronome S3 Ingest 
Automatically ingest events into Metronome from files stored in a S3 bucket in following formats:
- .json
- .csv (coming soon)
- .jsonl (coming soon)

It uses AWS S3 trigger to call a lambda function. It logs errors into an S3 bucket via a SQS.

![overview](./ingest-overview.png?raw=true "overview")

# How to deploy
## configure 
In the `variable.tf` you can modify some of the Terraform inputs like the bucket names and the cloud watch logs retention.

Create a file `terraform.tfvars` in the root folder with the following content
```bash
metronome_api_key = "YOUR_METRONOME_API_KEY"
```

## deploy
Run the following command to deploy the AWS resources
```bash
AWS_ACCESS_KEY=YOURKEY AWS_SECRET_ACCESS_KEY=YOURSECRET terraform apply
```
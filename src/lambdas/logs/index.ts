import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {v4 as uuidv4} from 'uuid';

const s3Client = new S3Client({});

type Response = {
  statusCode: number,
  body: string,
}

exports.handler = async function(msg: any): Promise<Response>{
  const log = JSON.parse(msg.Records[0].body);
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env["S3_BUCKET_LOGS"],
      Key: `${log.type} - ${new Date().toISOString()} - ${uuidv4()}`,
      Body: JSON.stringify(log),
      ContentType: "application/json"
    }));
    console.log(`${log.type} log stored in s3`)
    return {
      statusCode: 200,
      body: JSON.stringify("Log stored successfully!"),
    };
  } catch (err) {
    console.error("ERROR exeption storing log:", err, log);
    return {
      statusCode: 500,
      body: JSON.stringify("ERROR exeption storing log"),
    };
  }
};
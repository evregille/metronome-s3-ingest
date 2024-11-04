import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});
const SQS_QUEUE_URL = process.env["SQS_QUEUE_URL"];

const s3client = new S3Client({});
const lambdaClient = new LambdaClient({});
const MAX_EVENTS_PER_INGEST_BATCH = 100;

type MetronomeEvent = {
    timestamp: string,
    transaction_id: string,
    customer_id: string,
    event_type: string,
    properties?: object,
};
type MetronomeBatchEvents = MetronomeEvent[];
type MetronomeRequests = MetronomeBatchEvents[];

type GetObjectS3 = {
    error: boolean,
    message?: string,
    file_content?: string,
};

type Log = {
    type: string,
    message: string,
    events?: MetronomeBatchEvents[] | MetronomeEvent[] | string ,
}

exports.handler = async (event: any) => {
   
    const bucket = event.Records[0].s3.bucket.name,
        key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    // validate the file extension
    if((await validateFileFormat(key)) === false) return;

    // retrieve object from S3
    const response: GetObjectS3 = await fetchObjectFromS3(bucket, key); // retrieve the object created

    // validate the object content
    let events: MetronomeBatchEvents = [],
        eventsInvalid:any = [], 
        requests:MetronomeRequests = [];

    if(response && !response.error && response.file_content && response.file_content.length > 0){
        try {
            events = JSON.parse(response.file_content);
            if(Array.isArray(events) === false) events = [events]; 
        } catch(e) {
            await log({
                message: `ERROR reading object ${key} from bucket ${bucket}: JSON formating issue.`, 
                events: response.file_content, 
                type:'error'
            });
        }
        events.forEach((e,i) => {
            if(!isEventValidFormat(e)) { 
                events.splice(i, 1); // remove the element
                eventsInvalid.push(e);
            }   
        });
        if(eventsInvalid.length > 0) 
            await log({
                message: `ERROR Metronome malformated events in file ${key}: rejected by the ingest lambda.`, 
                events: eventsInvalid, 
                type:'error'
            });
        
        if(events.length > 0){ // ingest into Metronome 
            const splitEvery = function(n: number, xs: MetronomeBatchEvents, y:MetronomeRequests=[]): Array<MetronomeBatchEvents> {
               return xs.length === 0 ? y : splitEvery(n, xs.slice(n), y.concat([xs.slice(0, n)])) 
            };
            requests = splitEvery(MAX_EVENTS_PER_INGEST_BATCH, events);
            const promises = requests.map( async r => { // for each request trigger async send_to_metronome lambda
                try {
                    const response = await lambdaClient.send(new InvokeCommand({
                        FunctionName: process.env["LAMBDA_NAME_SEND_TO_METRONOME"],
                        InvocationType: "Event", 
                        Payload: JSON.stringify( r ),
                    }));   
                    if(response && response['$metadata'] && response['$metadata'].httpStatusCode  && response['$metadata'].httpStatusCode > 399)
                        await log({
                            message: `ERROR - Invoking the ${process.env["LAMBDA_NAME_SEND_TO_METRONOME"]} function with status ${response['$metadata'].httpStatusCode}`, 
                            events: r ,
                            type:'error',
                        });
                    return response;
                } catch (e) {
                    await log({
                        message: `ERROR - Exception Invoking the ${process.env["LAMBDA_NAME_SEND_TO_METRONOME"]} function ${JSON.stringify(e)}`, 
                        events: r , 
                        type:'error'
                    });
                    return null;
                }
            })
            await Promise.all(promises);
        }
    }
};

const validateFileFormat = async function(filename: string): Promise<boolean> {
    const fileExtension = filename.split('.')[ filename.split('.').length - 1 ];
    if(!fileExtension || (fileExtension != 'csv' && fileExtension != 'json' && fileExtension != 'jsonl')) {
        await log({
            message: `ERROR - object created with wrong format: ${filename}. Supported file format extensions are csv, json and jsonl`, 
            type:'error'
        });
        return false;
    }
    else return true;
}

// Function to fetch the content of the uploaded file
const fetchObjectFromS3 = async function(bucket:string, key: string): Promise<GetObjectS3> {
    try {
        const response = await s3client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
        const responseString = await response.Body?.transformToString()
        return {
            error: (responseString) ? false: true,
            message: "",
            file_content: (responseString) ? responseString : "",
        }
    } catch (err) {
        await log({
            message: `Error fetching object ${key} from bucket ${bucket}.`, 
            events: [], 
            type:'error' 
        })
        return {
            error: true,
            message: `Error fetching object ${key} from bucket ${bucket}.`,
            file_content:""
        }
    }
}

const isEventValidFormat = function(e: MetronomeEvent): boolean {
    if(e.customer_id && e.transaction_id && e.event_type && e.timestamp)
        return true;
    else 
        return false;
}

// publish logs to SQS 
const log = async function(log: Log): Promise<void> {
    if(log.type && log.type !== 'error' && process.env["STORE_ONLY_ERRORS"] === "true"){}
    else{
        try {
            const response = await sqsClient.send(new SendMessageCommand({
                QueueUrl: SQS_QUEUE_URL,
                MessageBody: JSON.stringify(log),
            }));
            if(response && response["$metadata"] && response["$metadata"].httpStatusCode && response["$metadata"].httpStatusCode < 399)
                console.log('SUCCESS - Log published to SQS.')
            else console.log('ERROR - Log failed to publish to SQS', response)
        } catch (e) {
            console.log(`ERROR - Exception publishing to SQS`, e);
        }
    }
}
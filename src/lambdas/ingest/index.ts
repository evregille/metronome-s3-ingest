import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});
const SQS_DEAD_QUEUE_URL = process.env["SQS_DEAD_QUEUE_URL"];
const SQS_INGEST_QUEUE_URL = process.env["SQS_INGEST_QUEUE_URL"]
const s3Client = new S3Client({});
const MAX_EVENTS_PER_INGEST_BATCH = 100;

type MetronomeEvent = {
    timestamp: string,
    transaction_id: string,
    customer_id: string,
    event_type: string,
    properties?: object,
};

type GetObjectS3 = {
    error: boolean,
    message?: string,
    events?: Array<MetronomeEvent>,
};

type Log = {
    type: string,
    message: string,
    events?: Array<MetronomeEvent> | string ,
}

exports.handler = async (event: any) => {
    const bucket = event.Records[0].s3.bucket.name,
        key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    const response: GetObjectS3 = await fetchObjectFromS3(bucket, key); 

    if(response.error && response.error === true){
        console.log('Error reading file - logging the error to S3.');
        log({
            message: `ERROR reading object ${key} from bucket ${bucket}: JSON formating issue.`, 
            type:'error'
        })
    }
    else if(response.events && response.events.length > 0){
        let events: MetronomeEvent[] = response.events,
            eventsInvalid:MetronomeEvent[] = [], 
            requests: MetronomeEvent[][] = [];

        events.forEach((e,i) => { // validate each event format
            if(!isEventValidFormat(e)) { 
                events.splice(i, 1); // remove the element
                eventsInvalid.push(e);
            }   
        });
        if(eventsInvalid.length > 0){ 
            console.log(`Events invalid - logging to S3 the ${eventsInvalid.length} malformed events.`, eventsInvalid)
            await log({
                message: `Metronome malformated events in file ${key}.`, 
                events: eventsInvalid, 
                type:'error'
            });
        }
        if(events.length > 0){ // ingest into Metronome 
            const splitEvery = function(n: number, xs: MetronomeEvent[], y:MetronomeEvent[][]=[]): any {
               return xs.length === 0 ? y : splitEvery(n, xs.slice(n), y.concat([xs.slice(0, n)])) 
            };
            requests = splitEvery(MAX_EVENTS_PER_INGEST_BATCH, events);
            console.log(`Sending ${events.length} to Metronome split into ${requests.length} requests.`)
            const promises = requests.map( async (r: any) => { 
                try {
                    const response = await sqsClient.send(new SendMessageCommand({
                        QueueUrl: SQS_INGEST_QUEUE_URL,
                        MessageBody: JSON.stringify(r),
                    }));
                    if(response && response['$metadata'] && response['$metadata'].httpStatusCode  && response['$metadata'].httpStatusCode > 399)
                        await log({
                            message: `Error sending message to the ingest queue with status ${response['$metadata'].httpStatusCode}`, 
                            events: r ,
                            type:'error',
                        });
                    return response;
                } catch (e) {
                    console.log('Error while sending message to ingest queue. Logging the error.')
                    await log({
                        message: `Exception sending message to ingest queue ${JSON.stringify(e)}`, 
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

// Function to fetch the content of the uploaded file
const fetchObjectFromS3 = async function(bucket:string, key: string): Promise<GetObjectS3> {
    const fileExtension = key.split('.')[ key.split('.').length - 1 ];
    if(!fileExtension || (fileExtension !== 'csv' && fileExtension !== 'json' && fileExtension !== 'jsonl')){
        return {
            error: true,
            message: `Object created with wrong format: ${key}. Supported file format extensions are csv, json and jsonl`,
        }
    }
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
        let responseString = await response.Body?.transformToString();
        if(!responseString){
            return {
                error: true,
                message: `Error fetching file ${key}: response empty file.`,
            }  
        }
        responseString = responseString.replace(/\r/g, ""); 
        let events: MetronomeEvent[] = [];
        if(fileExtension === 'json' || fileExtension === 'jsonl') {
            try{
                const responseJson = JSON.parse(responseString);
                if(Array.isArray(responseJson) === false) events = [responseJson]; 
                else events = responseJson
            } catch(e){
                return {
                    error: true,
                    message: `Error reading file ${key}: response malformated JSON. ${JSON.stringify(e)}`,
                }
            }
        }
        else 
            events = csvToJson(responseString)
        return {
            error: false,
            events: buildEventProperties(events),
        }        
    } catch (err) {
        return {
            error: true,
            message: `Error fetching object ${key} from bucket ${bucket}: ${JSON.stringify(err)}`,
        }
    }
}

const isEventValidFormat = function(e: MetronomeEvent): boolean {
    if(e.customer_id && e.transaction_id && e.event_type && e.timestamp)
        return true;
    else 
        return false;
}

// function to convert csv to string 
const csvToJson = function(csvString:string): Array<MetronomeEvent> {
    const rows = csvString.split("\n");
    const headers = rows[0].split(",");
    const jsonData: MetronomeEvent[] = [];

    for (let i = 1; i < rows.length; i++) {
        const values = rows[i].split(",");
        if(values.length > 0){
            let obj : {[k: string]: any} = {};
            for (let j = 0; j < headers.length; j++) {
                const key: string = headers[j].trim();
                const value: string | undefined = values[j] ? values[j].trim() : undefined;
                obj[key] = value;
            }
            jsonData.push(obj as MetronomeEvent);
        }
    }
    return jsonData;
}

// function to create properties attribute on each event
const buildEventProperties = function(events: any): Array<MetronomeEvent> {
    return events.map((e: any, idx: number) => {
        let formatedEvent = { ...e };
        Object.keys(e).forEach(key => {
            if(key !== "customer_id" && key !== "transaction_id" && key !=="timestamp" && key!=="event_type" && key !== "properties"){
                if(!formatedEvent.properties) formatedEvent["properties"] = {};
                formatedEvent["properties"][key] = e[key];
                delete formatedEvent[key];
            }
        }) 
        return formatedEvent;
    });
}

// publish logs to SQS 
const log = async function(log: Log): Promise<void> {
    if(log.type && log.type !== 'error' && process.env["STORE_ONLY_ERRORS"] === "true"){}
    else{
        try {
            const response = await sqsClient.send(new SendMessageCommand({
                QueueUrl: SQS_DEAD_QUEUE_URL,
                MessageBody: JSON.stringify(log),
            }));
            if(response && response["$metadata"] && response["$metadata"].httpStatusCode && response["$metadata"].httpStatusCode < 399)
                console.log('Log published to SQS.')
            else console.log('Log failed to publish to SQS', response)
        } catch (e) {
            console.log(`ERROR - Exception publishing to SQS`, e);
        }
    }
}
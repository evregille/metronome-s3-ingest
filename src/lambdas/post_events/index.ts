import Metronome from '@metronome/sdk';
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const client = new SQSClient({});
const SQS_QUEUE_URL = process.env['SQS_QUEUE_URL'];

const clientMetronome = new Metronome({ bearerToken: process.env['METRONOME_API_KEY'] });

type Log = {
    type: string,
    message: string,
    events?: Array<any> | string,
}

exports.handler = async (msg: any) => {
    const events = JSON.parse(msg.Records[0].body);
    try{
        await clientMetronome.usage.ingest(events);
        await log({
            message: `SUCCESS - metronome ingest API`, 
            events, 
            type: 'success'
        })
    } catch (error) {
        await log({ 
            message:`ERROR - Exception ingest event to Metronome ${JSON.stringify(error)}`, 
            events, 
            type: 'error' 
        })
    }
};

// publish logs to SQS 
const log = async function(log: Log): Promise<void> {
    if(log.type && log.type !== 'error' && process.env["STORE_ONLY_ERRORS"] === "true"){}
    else{
        try {
            const cmd = new SendMessageCommand({
                QueueUrl: SQS_QUEUE_URL,
                MessageBody: JSON.stringify(log),
            })
            const response = await client.send(cmd);
            if(response && response["$metadata"] && response["$metadata"].httpStatusCode && response["$metadata"].httpStatusCode < 399)
                console.log('INFO - Log published to SQS.')
            else console.log('ERROR - Log failed to publish to SQS', response)
        } catch (e) {
            console.log(`ERROR - Exception publishing to SQS`, e);
        }
    }
}
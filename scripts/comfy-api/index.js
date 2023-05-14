const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const { ComfyApi } = require('./ComfyApi');

const REGION = process.env.REGION || 'eu-north-1';
const SQS_ENDPOINT = process.env.SQS_ENDPOINT || 'http://localhost:4566';
const SQS_QUEUE_URL =
  process.env.SQS_URL || 'http://localhost:4566/000000000000/inference';

const sqs = new SQSClient({
  region: REGION,
  endpoint: SQS_ENDPOINT,
});

const WAIT_TIME_SECONDS = Number(process.env.WAIT_TIME_SECONDS) || 20;

const getSqsMessage = async (queueUrl, timeWait) => {
  const params = {
    QueueUrl: queueUrl,
    AttributeNames: ['SentTimestamp'],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ['All'],
    WaitTimeSeconds: timeWait,
  };

  const command = new ReceiveMessageCommand(params);

  const response = await sqs.send(command);

  if (!response.Messages || !response.Messages.length) {
    return [null, null];
  }

  const [message] = response.Messages;

  let payload = message.Body;

  try {
    payload = JSON.parse(message.Body);
  } catch (err) {
    console.log('Error parsing message body: ', err.toString());
    console.log('Faulty message body: ', message.Body);
    await deleteSQSMessage(queueUrl, message.ReceiptHandle);
    return [null, null];
  }

  return [payload, message.ReceiptHandle];
};

const deleteSQSMessage = async (queueUrl, receiptHandle) => {
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });

  await sqs.send(command);

  console.log('Deleted message.', receiptHandle);
};

const initComfyApi = () => {
  // Create an instance
  const comfyApi = new ComfyApi();

  // Add event listeners for desired message types
  comfyApi.on('status', (status) => {
    console.log('Status:', status);
  });

  comfyApi.on('progress', (progress) => {
    console.log('Progress:', progress);
  });

  comfyApi.on('executing', (node) => {
    console.log('Executing:', node);
  });

  comfyApi.on('executed', (data) => {
    console.log('Executed:', JSON.stringify(data, null, 2));
  });

  // Initialize the WebSocket connection
  comfyApi.init();

  return comfyApi;
};

async function main() {
  const comfyApi = initComfyApi();

  while (true) {
    console.log('Waiting for next message from Queue...');
    let [payload, receiptHandle] = await getSqsMessage(
      SQS_QUEUE_URL,
      WAIT_TIME_SECONDS
    );

    if (!payload) {
      while (!payload) {
        [payload, receiptHandle] = await getSqsMessage(
          SQS_QUEUE_URL,
          WAIT_TIME_SECONDS
        );
        if (payload) {
          break;
        }
      }
    }

    console.log('Found a message!');

    console.log('payload: ', payload);
    console.log('receiptHandle: ', receiptHandle);

    // Do the inference
    await comfyApi.queuePrompt(payload);

    // TODO: Message should only be deleted after we got a websocket confirmation
    // and we uploaded the image somewhere
    await deleteSQSMessage(SQS_QUEUE_URL, receiptHandle);
  }
}

main();

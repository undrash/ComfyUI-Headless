const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const { ComfyApi, COMFY_ADDRESS } = require('./ComfyApi');

const REGION = process.env.REGION || 'eu-north-1';
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || 'http://localhost:4566'; // For local development
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/inference';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'inference';
const SNS_TOPIC_ARN =
  process.env.SNS_TOPIC_ARN ||
  'arn:aws:sns:eu-north-1:000000000000:inference.fifo';

const NODE_ENV = process.env.NODE_ENV || 'dev';

const sqs = new SQSClient({
  region: REGION,
  ...(NODE_ENV === 'dev' && { endpoint: AWS_ENDPOINT }),
});

const s3 = new S3Client({
  region: REGION,
  ...(NODE_ENV === 'dev' && { endpoint: AWS_ENDPOINT, forcePathStyle: true }),
});

const sns = new SNSClient({
  region: REGION,
  ...(NODE_ENV === 'dev' && { endpoint: AWS_ENDPOINT }),
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

const publishSnsMessage = async (message) => {
  const command = new PublishCommand({
    TopicArn: SNS_TOPIC_ARN,
    Message: JSON.stringify(message),
    MessageGroupId: 'inference',
  });

  await sns.send(command);

  console.log('Published SNS message.');
};

const saveResultImages = async (images) => {
  const imagePromises = images.map(async (image, i) => {
    const { filename, subfolder, type } = image;
    const url = `http://${COMFY_ADDRESS}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();

    const arrayBuffer = await blob.arrayBuffer();

    const buffer = Buffer.from(arrayBuffer);

    const imageName = `${CURRENT_INFERENCE_ID}_${i}.png`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: imageName,
      Body: buffer,
    });

    await s3.send(command);
  });

  return Promise.all(imagePromises);
};

const initComfyApi = () => {
  // Create an instance
  const comfyApi = new ComfyApi();

  // Add event listeners for desired message types

  // comfyApi.on('status', (status) => {
  //   console.log('Status:', status);
  // });

  comfyApi.on('progress', (progress) => {
    console.log('Progress:', progress);
  });

  comfyApi.on('executing', (node) => {
    console.log('Executing:', node);
  });

  comfyApi.on('executed', async (data) => {
    console.log('Executed:', JSON.stringify(data, null, 2));

    const {
      output: { images },
    } = data;

    try {
      await saveResultImages(images);
    } catch (err) {
      console.log('Error saving result images: ', err.toString());
      INFERENCE_STATUS[CURRENT_INFERENCE_ID] = InferenceStatusTypes.FAILED;
      return;
    }

    try {
      await publishSnsMessage({
        pageId: CURRENT_INFERENCE_ID,
        status: InferenceStatusTypes.COMPLETED,
      });
    } catch (err) {
      console.log('Error publishing SNS message: ', err.toString());
      INFERENCE_STATUS[CURRENT_INFERENCE_ID] = InferenceStatusTypes.FAILED;
      return;
    }

    INFERENCE_STATUS[CURRENT_INFERENCE_ID] = InferenceStatusTypes.COMPLETED;
  });

  // Initialize the WebSocket connection
  comfyApi.init();

  return comfyApi;
};

const healthCheck = async (url, maxRetries = 6, retryInterval = 10000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      console.log('Health check OK!');
      console.log('COMFY UI is available at: ', url);
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry #${i + 1} in ${retryInterval / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
  }
};

const isValidObject = (obj) => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    !Array.isArray(obj) &&
    Object.keys(obj).length > 0
  );
};

const validatePayload = (payload) => {
  if (!payload) {
    throw new Error('Validation Error: Payload not found.');
  }

  if (!payload.id) {
    throw new Error(
      'Validation Error: The `id` field is missing from the message.'
    );
  }

  if (!payload.config) {
    throw new Error(
      'Validation Error: The `config` field is missing from the message.'
    );
  }

  if (!isValidObject(payload.config)) {
    throw new Error(
      'Validation Error: The `config` field is not a valid JSON object.'
    );
  }
};

const inferenceReady = async () => {
  let elapsedTime = 0;
  // TODO: Lift these to environment variables
  const maxTime = 60 * 1000; // 1 minute
  const waitTime = 2000; // 2 seconds

  while (true) {
    // Wait 2 seconds
    console.log('Waiting for prompt to be ready...');
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    elapsedTime += waitTime;

    if (INFERENCE_STATUS[CURRENT_INFERENCE_ID]) {
      console.log('Prompt is ready!');
      return INFERENCE_STATUS[CURRENT_INFERENCE_ID];
    }

    // Throw an error if the maximum time is reached
    if (elapsedTime >= maxTime) {
      throw new Error('Timed out waiting for prompt to be ready');
    }
  }
};

const INFERENCE_STATUS = {};
let CURRENT_INFERENCE_ID = null;

const InferenceStatusTypes = {
  COMPLETED: 'completed',
  FAILED: 'failed',
};

async function main() {
  await healthCheck(`http://${COMFY_ADDRESS}`);

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

    try {
      validatePayload(payload);
    } catch (err) {
      console.log('Invalid inference message payload. Skipping...');
      console.log('REASON: ', err.toString());
      await deleteSQSMessage(SQS_QUEUE_URL, receiptHandle);
      continue;
    }

    const { id, config } = payload;

    CURRENT_INFERENCE_ID = id;

    try {
      // Do the inference
      await comfyApi.queuePrompt(config);

      const status = await inferenceReady(id);

      console.log('Inference Status: ', status);
    } catch (error) {
      console.log('Inference Error: ', error);
    }

    delete INFERENCE_STATUS[CURRENT_INFERENCE_ID];

    // TODO: Message should only be deleted after we got a websocket confirmation
    // and we uploaded the image somewhere
    await deleteSQSMessage(SQS_QUEUE_URL, receiptHandle);
  }
}

main();

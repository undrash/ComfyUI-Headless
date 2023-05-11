const fs = require('fs');
const { ComfyApi } = require('./ComfyApi');

async function main() {
  const fileName = 'input.json';

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

  try {
    const fileContents = fs.readFileSync(fileName, { encoding: 'utf-8' });
    const prompt = JSON.parse(fileContents);

    await comfyApi.queuePrompt(prompt);
  } catch (error) {
    console.error(`Error reading file: ${fileName}`, error);
  }
}

main();

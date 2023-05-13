const fs = require('fs');
const path = require('path');
const { ComfyApi } = require('./ComfyApi');

const filePath = path.join(__dirname, 'input.json');

async function main() {
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
    const fileContents = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const prompt = JSON.parse(fileContents);

    setInterval(async () => {
      console.log('SIDECAR: queuing prompt...');
      await comfyApi.queuePrompt(prompt);
    }, 5000);
  } catch (error) {
    console.error(`Error reading file: ${filePath}`, error);
  }
}

main();

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/home/codegoddy/Desktop/prism-mcp/build/index.js'],
});

const client = {
  async connect(transport) {
    transport.onmessage = async (message) => {
      console.log('Received:', JSON.stringify(message, null, 2));
    };
    await transport.start();

    // Initialize
    await transport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    // Send initialized notification
    await transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // List tools
    await transport.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    setTimeout(() => transport.stop(), 1000);
  },
};

client.connect(transport);

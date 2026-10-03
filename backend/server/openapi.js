/**
 * OpenAPI 3.1.0 specification for the backend API.
 * This specification powers the Scalar API Reference and testing interface.
 */
export function createOpenApiSpec(port = 3000) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Web App API',
      version: '1.0.0',
      description: 'Interactive API documentation and endpoint testing interface powered by Scalar.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local development server',
      },
      {
        url: '/',
        description: 'Current host origin',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Server health and status endpoints',
      },
    ],
    paths: {
      '/': {
        get: {
          summary: 'Server health check',
          description: 'Checks if the server is healthy and returns a plain text status message.',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Server is healthy and running.',
              content: {
                'text/plain': {
                  schema: {
                    type: 'string',
                    example: `Server is healthy and running on port ${port}`,
                  },
                },
              },
            },
          },
        },
      },
      '/api/health': {
        get: {
          summary: 'Detailed API health check',
          description: 'Returns server operational status, port, and ISO timestamp in JSON format.',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Operational status details.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      port: { type: 'number', example: port },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                    required: ['status', 'port', 'timestamp'],
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

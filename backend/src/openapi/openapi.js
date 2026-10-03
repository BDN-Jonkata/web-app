/**
 * OpenAPI 3.1.0 specification for the backend API.
 * This specification powers the Scalar API Reference and testing interface.
 */
export function createOpenApiSpec(port = 3001) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Energy Bulgaria API',
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
      {
        name: 'AI & Chat',
        description: 'Energy simulation AI assistant endpoints',
      },
      {
        name: 'Authentication',
        description: 'Session and user authentication endpoints',
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
          description: 'Returns server operational status, port, service name, and ISO timestamp in JSON format.',
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
                      service: { type: 'string', example: 'energy-bulgaria' },
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
      '/api/chat': {
        post: {
          summary: 'Energy assistant chat',
          description: 'Sends a user message with the current simulation state to the AI assistant.',
          tags: ['AI & Chat'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Какво е текущото производство?' },
                    state: { type: 'object' },
                  },
                  required: ['message'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'AI response message and optional simulation patch.',
            },
          },
        },
      },
      '/api/auth/session': {
        get: {
          summary: 'Get active session',
          description: 'Returns the currently authenticated user if a valid session cookie exists.',
          tags: ['Authentication'],
          responses: {
            '200': {
              description: 'Session information.',
            },
          },
        },
      },
    },
  };
}

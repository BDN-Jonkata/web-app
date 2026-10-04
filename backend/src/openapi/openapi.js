import {emailAuthPaths} from './emailAuth.js';
/**
 * OpenAPI 3.1.0 specification for the backend API.
 * This specification powers the Scalar API Reference and interactive endpoint testing interface.
 */
export function createOpenApiSpec(port = 3001) {
  const csrfHeaderParam = {
    name: 'X-Requested-With',
    in: 'header',
    required: false,
    description: 'CSRF protection header for mutating requests. Defaults to "energy-web-app".',
    schema: {
      type: 'string',
      default: 'energy-web-app',
    },
  };

  const apiKeyHeaderParam = {
    name: 'X-Api-Key',
    in: 'header',
    required: false,
    description: 'Required only when the server sets SIMULATION_API_KEY. Must equal that value.',
    schema: { type: 'string' },
  };

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Energy Bulgaria API',
      version: '1.0.0',
      description:
        'Interactive API documentation and endpoint testing interface powered by Scalar. Includes full authentication, conversation history, AI simulation assistant, and health endpoints.',
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
    security: [
      { bearerAuth: [] },
      { cookieAuth: [] },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User registration, session management, password recovery, and preferences',
      },
      {
        name: 'Conversations',
        description: 'Stored conversations, message histories, and simulation state checkpoints',
      },
      {
        name: 'AI & Chat',
        description: 'Interactive energy simulation assistant and LLM provider endpoints',
      },
      {
        name: 'Health',
        description: 'Server health check, metrics, and runtime diagnostics',
      },
      {
        name: 'AI Simulation & Decisions',
        description: 'Endpoints for ingesting, querying, and resetting AI simulation decisions and per-component frames',
      },
    ],
    paths: {
      '/': {
        get: {
          summary: 'Root health check',
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
                      ai: {
                        type: 'object',
                        properties: {
                          provider: { type: 'string', example: 'groq' },
                          configured: { type: 'boolean', example: true },
                        },
                      },
                    },
                    required: ['status', 'port', 'timestamp'],
                  },
                },
              },
            },
          },
        },
      },
      ...emailAuthPaths(csrfHeaderParam),
      '/api/auth/logout': {
        post: {
          summary: 'User logout',
          description: 'Invalidates the current session token in the database and clears the session cookie.',
          tags: ['Authentication'],
          parameters: [csrfHeaderParam],
          responses: {
            '200': {
              description: 'Logged out successfully.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { type: 'null', example: null },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/refresh-token': {
        post: {
          summary: 'Refresh session token',
          description:
            'Renews an active session token either from the request body or from the HTTP-only cookie, invalidating the old token and returning a fresh session.',
          tags: ['Authentication'],
          parameters: [csrfHeaderParam],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'Optional explicit session token to refresh' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Session refreshed successfully.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/UserProfile' },
                      token: { type: 'string', example: 'vXz9_new_token_string...' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Missing, invalid, or expired session token.' },
          },
        },
      },
      '/api/auth/session': {
        get: {
          summary: 'Get active session',
          description: 'Returns the currently authenticated user if a valid session cookie exists, or null otherwise.',
          tags: ['Authentication'],
          responses: {
            '200': {
              description: 'Active session info.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: {
                        anyOf: [{ $ref: '#/components/schemas/UserProfile' }, { type: 'null' }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/preferences': {
        put: {
          summary: 'Update user preferences',
          description: 'Updates UI theme and language preferences for the currently authenticated user.',
          tags: ['Authentication'],
          parameters: [csrfHeaderParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    theme: { type: 'string', enum: ['light', 'dark', 'forest', 'sunset', 'system'], example: 'forest' },
                    language: { type: 'string', enum: ['bg', 'en'], example: 'bg' },
                  },
                  required: ['theme', 'language'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Updated user preferences.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/UserProfile' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid theme or language parameter.' },
            '401': { description: 'Authentication required.' },
          },
        },
      },
      '/api/conversations': {
        get: {
          summary: 'List user conversations',
          description: 'Retrieves the list of conversations saved by the currently authenticated user.',
          tags: ['Conversations'],
          responses: {
            '200': {
              description: 'List of conversation summaries.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      conversations: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', example: 'c-conversation-id-123' },
                            title: { type: 'string', example: 'План за вятърна енергия' },
                            updatedAt: { type: 'string', format: 'date-time' },
                            _count: {
                              type: 'object',
                              properties: {
                                messages: { type: 'number', example: 4 },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required.' },
          },
        },
      },
      '/api/conversations/{id}': {
        get: {
          summary: 'Load conversation details',
          description: 'Loads messages and simulation state for a specific conversation belonging to the user.',
          tags: ['Conversations'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Unique conversation ID',
              schema: { type: 'string', example: 'conversation-id-123' },
            },
          ],
          responses: {
            '200': {
              description: 'Conversation details and message history.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      conversation: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          updatedAt: { type: 'string', format: 'date-time' },
                          state: { type: 'object' },
                          messages: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                role: { type: 'string', enum: ['user', 'assistant'] },
                                content: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required.' },
            '404': { description: 'Conversation not found or not owned by user.' },
          },
        },
        put: {
          summary: 'Save conversation history and simulation state',
          description: 'Saves or updates messages and simulation state for the specified conversation.',
          tags: ['Conversations'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Unique conversation identifier (16-80 chars)',
              schema: { type: 'string', example: 'convo-sample-12345678' },
            },
            csrfHeaderParam,
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    messages: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          role: { type: 'string', enum: ['user', 'assistant'], example: 'user' },
                          content: { type: 'string', example: 'Какво е текущото производство?' },
                        },
                        required: ['role', 'content'],
                      },
                    },
                    state: {
                      type: 'object',
                      description: 'Energy simulation state object',
                      example: {
                        season: 'winter',
                        hour: 12,
                        nuclearPower: 2000,
                        thermalPower: 1200,
                        hydroPower: 600,
                        solarPower: 800,
                        windPower: 400,
                      },
                    },
                  },
                  required: ['messages'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Conversation successfully saved.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      conversation: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          updatedAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid history or state format.' },
            '401': { description: 'Authentication required.' },
          },
        },
      },
      '/api/chat': {
        post: {
          summary: 'Energy simulation chat',
          description:
            'Sends a user message along with current simulation state to the AI assistant to analyze Bulgarian grid balance.',
          tags: ['AI & Chat'],
          parameters: [csrfHeaderParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Какво е текущото производство на АЕЦ Козлодуй?' },
                    state: {
                      type: 'object',
                      example: {
                        season: 'winter',
                        hour: 14,
                        temperature: 2,
                        nuclearPower: 2000,
                      },
                    },
                    language: { type: 'string', enum: ['bg', 'en'], default: 'bg', example: 'bg' },
                  },
                  required: ['message'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'AI response message with optional simulation state update.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      reply: { type: 'string', example: 'В момента АЕЦ Козлодуй работи с пълна мощност от 2000 MW...' },
                      patch: { type: 'object' },
                      state: { type: 'object' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid message or state payload.' },
            '429': { description: 'Rate limit exceeded.' },
          },
        },
      },
      '/api/simulation/decision': {
        post: {
          summary: 'Ingest AI simulation decision and component data',
          description:
            'Receives an exact JSON simulation payload from an AI agent or test runner, validates per-component frames, updates in-memory active simulation, and broadcasts to connected frontend clients.',
          tags: ['AI Simulation & Decisions'],
          parameters: [csrfHeaderParam, apiKeyHeaderParam],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string', example: 'Winter blizzard at 19:00 with Belovo hydro peaking dispatch' },
                    decision: {
                      type: 'object',
                      properties: {
                        answer: { type: 'string', example: 'Belovo hydro dispatched to 100% capacity.' },
                        summary: { type: 'string', example: 'Peak covered by hydro and Kozloduy NPP.' },
                        actions: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              component: { type: 'string', example: 'hydro' },
                              action: { type: 'string', example: 'dispatch_max' },
                              target: { type: 'string', example: 'belovo' },
                              value: { type: 'number', example: 736 },
                            },
                          },
                        },
                      },
                      required: ['answer'],
                    },
                    scenario: {
                      type: 'object',
                      properties: {
                        season: { type: 'string', enum: ['winter', 'spring', 'summer', 'autumn'], example: 'winter' },
                        hour: { type: 'number', example: 19 },
                        cloud: { type: 'number', example: 95 },
                        wind: { type: 'number', example: 25 },
                      },
                    },
                    components: {
                      type: 'object',
                      description: 'Top-level component snapshot (or supply frames array for multi-step timelines)',
                      properties: {
                        stats: {
                          type: 'object',
                          properties: {
                            res: { type: 'number', example: 1450 },
                            demand: { type: 'number', example: 4276 },
                            coverage: { type: 'number', example: 33.9 },
                            balance: { type: 'number', example: -2826 },
                            mw: {
                              type: 'object',
                              properties: {
                                solar: { type: 'number', example: 0 },
                                wind: { type: 'number', example: 76 },
                                hydro: { type: 'number', example: 1339 },
                                other: { type: 'number', example: 35 },
                              },
                            },
                          },
                          required: ['res', 'demand'],
                        },
                        map: {
                          type: 'object',
                          properties: {
                            sites: { type: 'object' },
                            cities: { type: 'object' },
                            flows: { type: 'array' },
                            nuclear: { type: 'object' },
                          },
                        },
                        detail: { type: 'object' },
                      },
                    },
                    frames: {
                      type: 'array',
                      description: 'Optional timeline frames for multi-step simulations',
                      items: {
                        type: 'object',
                        properties: {
                          step: { type: 'number', example: 0 },
                          hour: { type: 'number', example: 19 },
                          label: { type: 'string', example: '19:00 Peak' },
                          stats: { type: 'object' },
                          map: { type: 'object' },
                          detail: { type: 'object' },
                        },
                      },
                    },
                  },
                  required: ['prompt'],
                },
              },
            },
          },
          responses: {
            '401': { description: 'Missing or wrong X-Api-Key (only when SIMULATION_API_KEY is configured).' },
            '429': { description: 'Rate limit exceeded.' },
            '200': {
              description: 'Simulation successfully ingested and active in memory.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string' },
                      id: { type: 'string' },
                      totalSteps: { type: 'number' },
                      isTimeline: { type: 'boolean' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid simulation payload.' },
          },
        },
      },
      '/api/simulation/state': {
        get: {
          summary: 'Get active simulation state',
          description: 'Returns the currently active AI simulation snapshot and decision data, or active: false if idle.',
          tags: ['AI Simulation & Decisions'],
          responses: {
            '200': {
              description: 'Active simulation status.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      active: { type: 'boolean', example: true },
                      simulation: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/simulation/events': {
        get: {
          summary: 'Subscribe to simulation updates (Server-Sent Events)',
          description: 'Long-lived text/event-stream. Sends an init event, then update and reset events, plus a heartbeat every 15 seconds. At most 100 streams are served at once.',
          tags: ['AI Simulation & Decisions'],
          responses: {
            '200': { description: 'Event stream.', content: { 'text/event-stream': { schema: { type: 'string' } } } },
            '503': { description: 'Too many active streams.' },
          },
        },
      },
      '/api/simulation/reset': {
        post: {
          summary: 'Reset simulation to empty baseline',
          description: 'Clears the in-memory active simulation back to unseeded baseline.',
          tags: ['AI Simulation & Decisions'],
          parameters: [csrfHeaderParam, apiKeyHeaderParam],
          responses: {
            '401': { description: 'Missing or wrong X-Api-Key (only when SIMULATION_API_KEY is configured).' },
            '429': { description: 'Rate limit exceeded.' },
            '200': {
              description: 'Simulation reset successfully.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Token',
          description:
            'Session access token returned only after verify-code. Paste it here to test authenticated endpoints in Scalar.',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'energy_session',
          description: 'Session cookie set only after email verification.',
        },
        verificationCookie:{type:'apiKey',in:'cookie',name:'energy_verification',description:'Short-lived HttpOnly challenge cookie; automatically set by register/login/forgot-password.'},
        csrfProtection: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Requested-With',
          description: 'Required header for all mutating API requests (value: energy-web-app).',
        },
      },
      schemas: {
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'usr_cl123456789' },
            email: { type: 'string', format: 'email', example: 'user@example.test' },
            name: { type: 'string', example: 'Георги Димитров' },
            isEmailVerified: { type: 'boolean', example: false },
            preferences: {
              type: 'object',
              properties: {
                theme: { type: 'string', example: 'system' },
                language: { type: 'string', example: 'bg' },
              },
            },
          },
          required: ['id', 'email', 'name', 'isEmailVerified', 'preferences'],
        },
      },
    },
  };
  return spec;
}

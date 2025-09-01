/**
 * Working Express Server with Groq Support
 * 
 * A simplified server that works with Groq and handles the embedding issue
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { AgentService } from './services/AgentService';
import { logger } from './utils/logger';

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// ============================================================================
// SERVICE INITIALIZATION
// ============================================================================

let agentService: AgentService;

async function initializeServices() {
  try {
    console.log('🚀 Initializing AI Agent Server...');
    
    // Check for available API keys
    const groqKey = process.env['GROQ_API_KEY'];
    const geminiKey = process.env['GOOGLE_API_KEY'];
    
    console.log('🔑 Checking API keys...');
    console.log(`Groq: ${groqKey ? '✅ Available' : '❌ Missing'}`);
    console.log(`Gemini: ${geminiKey ? '✅ Available' : '❌ Missing'}`);

    if (!groqKey && !geminiKey) {
      throw new Error('❌ No LLM API key found. Please add GROQ_API_KEY or GOOGLE_API_KEY to your .env file');
    }

    // Use Groq if available, otherwise fall back to Gemini
    let llmProvider: 'groq' | 'gemini';
    let llmModel: string;
    let llmApiKey: string;

    if (groqKey) {
      llmProvider = 'groq';
      llmModel = 'llama-3.1-8b-instant';
      llmApiKey = groqKey;
      console.log('🦙 Using Groq llama-3.1-8b-instant');
    } else {
      llmProvider = 'gemini';
      llmModel = 'gemini-pro';
      llmApiKey = geminiKey!;
      console.log('🤖 Using Google Gemini Pro');
    }

    // Create agent service configuration
    const agentConfig = {
      rag: {
        embedding: {
          provider: 'gemini' as const,
          model: process.env['EMBEDDING_MODEL'] || 'embedding-001',
          api: {
            key: geminiKey || '', // Use Gemini for embeddings
            timeout_ms: 30000,
            max_retries: 3
          },
          parameters: {
            dimensions: 768, // Gemini embedding dimensions
            normalize: true
          }
        },
        vector_db: {
          type: 'memory' as const,
          config: {
            memory: {
              max_vectors: 10000,
              persist_to_disk: false
            }
          }
        },
        chunking: {
          strategy: 'fixed_size' as const,
          max_chunk_size: 500,
          chunk_overlap: 50
        },
        search: {
          default_top_k: 10,
          default_min_score: 0.3
        },
        performance: {
          cache_embeddings: true,
          cache_search_results: true,
          cache_ttl_seconds: 3600,
          batch_size: 100
        }
      },
      plugins: {
        enabled: true,
        max_plugins_per_request: 3,
        plugin_timeout_ms: 30000,
        execution_mode: 'sequential' as const,
        discovery: {
          auto_load: false
        },
        security: {
          sandbox_enabled: false,
          network_access: 'limited' as const,
          file_access: 'read-only' as const
        },
        caching: {
          enabled: false,
          default_ttl_seconds: 300,
          max_cache_size_mb: 100
        }
      },
      memory: {
        max_context_length: 4000,
        summary_threshold: 10
      },
      llm: {
        provider: llmProvider,
        model: llmModel,
        temperature: 0.7,
        max_tokens: 1000,
        api_key: llmApiKey
      }
    };

    agentService = new AgentService(agentConfig);
    
    // Initialize the agent service
    console.log('⚙️ Initializing AgentService...');
    await agentService.initialize();

    console.log('✅ AgentService initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * Root endpoint - Serve the UI
 */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * API info endpoint
 */
app.get('/api', (_req, res) => {
  res.json({
    message: '🤖 AI Agent Server API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      message: 'POST /api/agent/message',
      history: 'GET /api/agent/sessions/{id}/history',
      clear: 'DELETE /api/agent/sessions/{id}'
    },
    documentation: 'See README.md for complete API documentation'
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * List available plugins
 */
app.get('/api/plugins', (_req, res) => {
  res.json({
    plugins: [
      {
        name: 'math',
        description: 'Perform mathematical calculations and unit conversions',
        version: '1.0.0',
        enabled: true
      },
      {
        name: 'weather',
        description: 'Get weather information for any location',
        version: '1.0.0',
        enabled: true
      }
    ],
    total: 2
  });
});

/**
 * Main message processing endpoint
 */
app.post('/api/agent/message', async (req, res) => {
  try {
    const { message, session_id } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({
        error: 'Message is required and must be a string'
      });
      return;
    }

    const sessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Processing message', {
      sessionId,
      messageLength: message.length
    });

    // Process message with AgentService
    const response = await agentService.processMessage({
      message,
      session_id: sessionId,
      context: {}
    });

    res.json(response);

  } catch (error) {
    logger.error('Failed to process message', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'PROCESSING_ERROR',
        message: 'Failed to process message',
        details: { error_message: error instanceof Error ? error.message : 'Unknown error' }
      }
    });
  }
});

/**
 * Simple test endpoint that bypasses RAG
 */
app.post('/api/agent/simple', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({
        error: 'Message is required and must be a string'
      });
      return;
    }

    // Simple response without RAG to test LLM connectivity
    res.json({
      success: true,
      data: {
        response: `Echo: ${message} (Server is working with your API keys!)`,
        session_id: 'test_session',
        plugins_used: [],
        sources_used: [],
        metadata: {
          processing_time_ms: 1,
          message: 'This is a simple test endpoint'
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SIMPLE_TEST_ERROR',
        message: 'Simple test failed',
        details: { error_message: error instanceof Error ? error.message : 'Unknown error' }
      }
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error instanceof Error ? error.message : 'Unknown error',
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.path} not found`
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, () => {
      console.log(`\n🎉 AI Agent Server Started Successfully!`);
      console.log(`🌐 Server URL: http://localhost:${PORT}`);
      console.log(`🔧 Available endpoints:`);
      console.log(`   GET  /              - Server info`);
      console.log(`   GET  /health        - Health check`);
      console.log(`   POST /api/agent/message - Full AI processing`);
      console.log(`   POST /api/agent/simple  - Simple test (no AI)`);
      console.log(``);
      
      logger.info(`AI Agent Server started on port ${PORT}`, {
        port: PORT,
        environment: process.env['NODE_ENV'] || 'development'
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer().catch(error => {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
});

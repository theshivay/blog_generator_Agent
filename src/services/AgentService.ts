/**
 * Agent Service
 * 
 * This is the main orchestration service that coordinates all components
 * of the AI Agent system including LLM, RAG, Memory, and Plugins.
 * It processes user messages and provides intelligent responses.
 */

import { AgentMessageRequest, AgentMessageResponse } from '../types/agent';
import { RAGConfig, RAGContext } from '../types/rag';
import { PluginSystemConfig } from '../types/plugin';
import { LLMService } from './LLMService';
import { RAGService } from './RAGService';
import { MemoryService } from './MemoryService';
import { PluginService } from './PluginService';
import { logger } from '../utils/logger';

// ============================================================================
// AGENT SERVICE CONFIGURATION
// ============================================================================

export interface AgentServiceConfig {
  /** RAG system configuration */
  rag: RAGConfig;
  
  /** Plugin system configuration */
  plugins: Partial<PluginSystemConfig>;
  
  /** Memory service configuration */
  memory: {
    max_context_length: number;
    summary_threshold: number;
  };
  
  /** LLM service configuration */
  llm: {
    provider: 'groq' | 'gemini';
    model: string;
    temperature: number;
    max_tokens: number;
    api_key: string;
  };
}

// ============================================================================
// MAIN AGENT SERVICE
// ============================================================================

export class AgentService {
  private llmService: LLMService;
  private ragService: RAGService;
  private memoryService: MemoryService;
  private pluginService: PluginService;
  private config: AgentServiceConfig;

  constructor(config: AgentServiceConfig) {
    this.config = config;
    
    // Initialize services
    // Initialize main LLM service for chat completions
    this.llmService = new LLMService({
      provider: config.llm.provider,
      apiKey: config.llm.api_key,
      model: config.llm.model
    });

    // Create a separate LLM service for embeddings (using Gemini)
    const embeddingLLMService = new LLMService({
      provider: 'gemini',
      apiKey: process.env['GOOGLE_API_KEY'] || config.llm.api_key,
      model: 'embedding-001'
    });

    this.ragService = new RAGService({
      dataDirectory: './knowledge-base',
      chunkingConfig: {
        strategy: 'fixed_size',
        max_chunk_size: 500,
        chunk_overlap: 50
      },
      llmService: embeddingLLMService, // Use Gemini for embeddings
      minSimilarityScore: 0.3,
      defaultTopK: 10,
      cacheEmbeddings: true
    });
    
    this.memoryService = new MemoryService({
      maxMessagesPerSession: 100,
      summaryThreshold: config.memory.summary_threshold,
      sessionTTL: 24 * 60 * 60 * 1000,
      persistSessions: false
    });
    
    this.pluginService = new PluginService(config.plugins);

    logger.info('AgentService initialized successfully');
  }

  /**
   * Initialize the agent service - must be called before processing messages
   */
  async initialize(): Promise<void> {
    logger.info('Initializing AgentService...');
    
    // Initialize RAG service (loads knowledge base)
    await this.ragService.initialize();
    
    logger.info('AgentService initialization complete');
  }

  /**
   * Process a user message and generate an intelligent response
   */
  async processMessage(request: AgentMessageRequest): Promise<AgentMessageResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing user message', {
        sessionId: request.session_id,
        messageLength: request.message.length
      });

      // Step 1: Get conversation history
      const conversationHistory = await this.memoryService.getConversationHistory(
        request.session_id,
        10 // Get last 10 messages
      );

      // Step 2: Process with plugins first (they might provide direct answers)
      const pluginResults = await this.pluginService.processInput(request.message, {
        session_id: request.session_id,
        user_preferences: (request.context?.['user_preferences'] as Record<string, unknown>) || {} as Record<string, unknown>,
        conversation_history: conversationHistory.filter(msg => 
          msg.role === 'user' || msg.role === 'assistant'
        ).map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp
        })),
        metadata: {
          request_timestamp: new Date(),
          request_source: 'agent_service'
        }
      });

      // Step 3: Get relevant context from RAG system
      const ragContext: RAGContext = {
        query: request.message,
        session_id: request.session_id,
        search_params: {
          query: request.message,
          top_k: 5,
          min_similarity_score: 0.3
        }
      };
      
      const ragResults = await this.ragService.retrieveContent(ragContext);

      // Step 4: Store user message in memory
      await this.memoryService.addMessage(
        request.session_id,
        'user',
        request.message,
        {
          plugins_used: pluginResults.plugins_executed.map(p => p.plugin_id),
          processing_time_ms: Date.now() - startTime
        }
      );

      // Step 5: Build context for LLM
      const systemPrompt = this.buildSystemPrompt(ragResults, pluginResults);
      const userPrompt = request.message;

      // Step 6: Generate response using LLM
      const llmResponse = await this.llmService.generateCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-5).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          })),
          { role: 'user', content: userPrompt }
        ],
        temperature: this.config.llm.temperature,
        max_tokens: this.config.llm.max_tokens
      });

      // Step 7: Store assistant response in memory
      await this.memoryService.addMessage(
        request.session_id,
        'assistant',
        llmResponse.content,
        {
          sources_used: ragResults.retrieved_chunks.map((chunk: any) => chunk.source.filename),
          plugins_used: pluginResults.plugins_executed.map(p => p.plugin_id),
          processing_time_ms: Date.now() - startTime
        }
      );

      // Step 8: Build and return response
      const response: AgentMessageResponse = {
        success: true,
        data: {
          response: llmResponse.content,
          session_id: request.session_id,
          plugins_used: pluginResults.plugins_executed.map(execution => execution.plugin_id),
          sources_used: ragResults.retrieved_chunks.map((chunk: any) => ({
            filename: chunk.source.filename,
            relevance_score: chunk.similarity || 0,
            chunk: chunk.content,
            metadata: {
              section: chunk.source.section,
              start_pos: chunk.metadata?.start_pos,
              length: chunk.metadata?.length
            }
          })),
          metadata: {
            processing_time_ms: Date.now() - startTime,
            token_usage: {
              prompt_tokens: llmResponse.usage?.prompt_tokens || 0,
              completion_tokens: llmResponse.usage?.completion_tokens || 0,
              total_tokens: llmResponse.usage?.total_tokens || 0
            },
            confidence_score: 0.8
          }
        }
      };

      logger.info('Message processing completed', {
        sessionId: request.session_id,
        processingTime: Date.now() - startTime,
        sourcesUsed: ragResults.retrieved_chunks.length,
        pluginsUsed: pluginResults.plugins_executed.length
      });

      return response;

    } catch (error) {
      logger.error('Failed to process message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: request.session_id
      });

      // Return error response
      return {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Failed to process message',
          details: { error_message: error instanceof Error ? error.message : 'Unknown error' }
        }
      };
    }
  }

  /**
   * Clear conversation history for a session
   */
  async clearSession(sessionId: string): Promise<void> {
    this.memoryService.clearSession(sessionId);
    logger.info('Session cleared', { sessionId });
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(sessionId: string, limit: number = 50) {
    const history = await this.memoryService.getConversationHistory(sessionId, limit);
    
    return {
      messages: history.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })),
      total_messages: history.length
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Build system prompt with context from RAG and plugins
   */
  private buildSystemPrompt(ragResults: any, pluginResults: any): string {
    let prompt = `You are an intelligent AI assistant with access to a knowledge base and various tools. Your role is to provide helpful, accurate, and contextual responses.

GUIDELINES:
- Be helpful, informative, and conversational
- Use the provided context when relevant
- If plugins have provided specific information, incorporate it naturally
- Acknowledge when you don't have enough information
- Be concise but complete in your responses

`;

    // Add RAG context if available
    if (ragResults.retrieved_chunks && ragResults.retrieved_chunks.length > 0) {
      prompt += `KNOWLEDGE BASE CONTEXT:
The following information from the knowledge base may be relevant to the user's question:

`;
      ragResults.retrieved_chunks.slice(0, 3).forEach((chunk: any, index: number) => {
        prompt += `${index + 1}. From ${chunk.source.filename}:
${chunk.content}

`;
      });
    }

    // Add plugin results if available
    if (pluginResults.plugins_executed && pluginResults.plugins_executed.length > 0) {
      const successfulPlugins = pluginResults.plugins_executed.filter((p: any) => p.result.success);
      if (successfulPlugins.length > 0) {
        prompt += `TOOL RESULTS:
The following tools have provided specific information:

`;
        successfulPlugins.forEach((plugin: any) => {
          prompt += `- ${plugin.plugin_id}: ${plugin.result.message}
`;
        });
        prompt += '\n';
      }
    }

    prompt += `Please provide a helpful response based on the user's question and any relevant context provided above.`;

    return prompt;
  }
}

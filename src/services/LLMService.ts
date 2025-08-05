/**
 * LLM Service
 * 
 * This service provides a unified interface for interacting with different
 * Large Language Model providers (Groq, Gemini).
 * It handles API calls, response parsing, and error handling.
 */

import axios, { AxiosResponse } from 'axios';
import { TokenUsage } from '../types/agent';
import { logger } from '../utils/logger';

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: TokenUsage;
  finish_reason?: string;
  provider: string;
}

export interface LLMProviderConfig {
  provider: 'groq' | 'gemini';
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
}

// ============================================================================
// LLM SERVICE CLASS
// ============================================================================

export class LLMService {
  private config: LLMProviderConfig;
  private retryCount = 0;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    logger.info(`Initialized LLM Service with provider: ${config.provider}`);
  }

  /**
   * Generate a completion using the configured LLM provider
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    try {
      logger.info(`Generating completion with ${this.config.provider}`, {
        model: request.model || this.config.model,
        messageCount: request.messages.length,
        temperature: request.temperature
      });

      let response: LLMResponse;

      switch (this.config.provider) {
        case 'groq':
          response = await this.callGroq(request);
          break;
        case 'gemini':
          response = await this.callGemini(request);
          break;
        default:
          throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`LLM completion generated successfully`, {
        provider: this.config.provider,
        model: response.model,
        duration_ms: duration,
        usage: response.usage
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`LLM completion failed`, {
        provider: this.config.provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration,
        retryCount: this.retryCount
      });

      // Retry logic
      if (this.shouldRetry(error) && this.retryCount < (this.config.maxRetries || 3)) {
        this.retryCount++;
        logger.info(`Retrying LLM request (attempt ${this.retryCount})`);
        await this.delay(1000 * this.retryCount); // Exponential backoff
        return this.generateCompletion(request);
      }

      this.retryCount = 0;
      throw error;
    }
  }

  /**
   * Generate embeddings for text (used by RAG system)
   */
  async generateEmbeddings(texts: string[], model?: string): Promise<number[][]> {
    const startTime = Date.now();

    try {
      logger.info(`Generating embeddings`, {
        provider: this.config.provider,
        textCount: texts.length,
        model: model || 'text-embedding-ada-002'
      });

      let embeddings: number[][];

      switch (this.config.provider) {
        case 'groq':
          // Groq doesn't provide embeddings, use Gemini instead
          embeddings = await this.generateGeminiEmbeddings(texts, model);
          break;
        case 'gemini':
          embeddings = await this.generateGeminiEmbeddings(texts, model);
          break;
        default:
          throw new Error(`Embedding not supported for provider: ${this.config.provider}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`Embeddings generated successfully`, {
        provider: this.config.provider,
        duration_ms: duration,
        embeddingCount: embeddings.length
      });

      return embeddings;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Embedding generation failed`, {
        provider: this.config.provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration
      });
      throw error;
    }
  }

  // ============================================================================
  // OPENAI IMPLEMENTATION
  // ============================================================================
  // GROQ IMPLEMENTATION
  // ============================================================================

  private async callGroq(request: LLMRequest): Promise<LLMResponse> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    const payload = {
      model: request.model || this.config.model || 'llama3-8b-8192',
      messages: request.messages,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens || 1000,
      top_p: request.top_p || 1,
      stream: false
    };

    const response: AxiosResponse = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.config.timeout || 30000
    });

    const choice = response.data.choices[0];
    if (!choice) {
      throw new Error('No choices returned from Groq API');
    }

    return {
      content: choice.message.content,
      model: response.data.model,
      usage: {
        prompt_tokens: response.data.usage?.prompt_tokens || 0,
        completion_tokens: response.data.usage?.completion_tokens || 0,
        total_tokens: response.data.usage?.total_tokens || 0
      },
      finish_reason: choice.finish_reason,
      provider: 'groq'
    };
  }

  // ============================================================================
  // GEMINI IMPLEMENTATION
  // ============================================================================

  private async callGemini(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.config.model || 'gemini-pro';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`;
    
    // Convert OpenAI format to Gemini format
    const geminiMessages = this.convertToGeminiFormat(request.messages);
    
    const payload = {
      contents: geminiMessages,
      generationConfig: {
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.max_tokens || 1000,
        topP: request.top_p || 1
      }
    };

    const response: AxiosResponse = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: this.config.timeout || 30000
    });

    const candidate = response.data.candidates?.[0];
    if (!candidate || !candidate.content) {
      throw new Error('No content returned from Gemini API');
    }

    return {
      content: candidate.content.parts[0].text,
      model: model,
      usage: {
        prompt_tokens: response.data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.data.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.data.usageMetadata?.totalTokenCount || 0
      },
      finish_reason: candidate.finishReason,
      provider: 'gemini'
    };
  }

  private async generateGeminiEmbeddings(texts: string[], model?: string): Promise<number[][]> {
    const embedModel = model || 'embedding-001';
    const embeddings: number[][] = [];

    // Gemini requires individual requests for embeddings
    for (const text of texts) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${embedModel}:embedContent?key=${this.config.apiKey}`;
      
      const payload = {
        content: {
          parts: [{ text }]
        }
      };

      const response: AxiosResponse = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout || 30000
      });

      if (response.data.embedding?.values) {
        embeddings.push(response.data.embedding.values);
      }
    }

    return embeddings;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Convert OpenAI message format to Gemini format
   */
  private convertToGeminiFormat(messages: LLMMessage[]): any[] {
    const geminiMessages: any[] = [];
    
    // Combine system messages into a single instruction
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    if (systemMessages.length > 0) {
      const systemContent = systemMessages.map(m => m.content).join('\n\n');
      geminiMessages.push({
        role: 'user',
        parts: [{ text: `Instructions: ${systemContent}\n\n---\n\n` }]
      });
    }
    
    // Convert conversation messages
    for (const message of conversationMessages) {
      geminiMessages.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      });
    }
    
    return geminiMessages;
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Retry on rate limits, server errors, and timeouts
      return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
    }
    
    // Retry on network errors
    return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
  }

  /**
   * Simple delay utility for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  static estimateTokenCount(text: string): number {
    // Rough approximation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate LLM configuration
   */
  static validateConfig(config: LLMProviderConfig): void {
    if (!config.provider) {
      throw new Error('LLM provider is required');
    }
    
    if (!config.apiKey) {
      throw new Error(`API key is required for ${config.provider}`);
    }
    
    if (!config.model) {
      throw new Error('Model name is required');
    }
    
    const validProviders = ['groq', 'gemini'];
    if (!validProviders.includes(config.provider)) {
      throw new Error(`Invalid provider: ${config.provider}. Must be one of: ${validProviders.join(', ')}`);
    }
  }

  /**
   * Get default models for each provider
   */
  static getDefaultModel(provider: string): string {
    switch (provider) {
      case 'groq':
        return 'llama3-8b-8192';
      case 'gemini':
        return 'gemini-pro';
      default:
        throw new Error(`No default model for provider: ${provider}`);
    }
  }

  /**
   * Create LLM service from environment variables
   */
  static fromEnvironment(): LLMService {
    // Determine provider from available environment variables
    let provider: 'groq' | 'gemini';
    let apiKey: string;
    
    if (process.env['GROQ_API_KEY']) {
      provider = 'groq';
      apiKey = process.env['GROQ_API_KEY'];
    } else if (process.env['GOOGLE_API_KEY']) {
      provider = 'gemini';
      apiKey = process.env['GOOGLE_API_KEY'];
    } else {
      throw new Error('No LLM API key found in environment variables. Please set GROQ_API_KEY or GOOGLE_API_KEY');
    }
    
    const config: LLMProviderConfig = {
      provider,
      apiKey,
      model: LLMService.getDefaultModel(provider),
      timeout: 30000,
      maxRetries: 3
    };
    
    // Validate configuration
    LLMService.validateConfig(config);
    
    return new LLMService(config);
  }
}

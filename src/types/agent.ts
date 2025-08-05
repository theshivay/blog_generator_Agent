/**
 * Core Agent Types
 * 
 * This file defines the fundamental types used throughout the AI Agent system.
 * These interfaces ensure type safety and clear contracts between different components.
 */

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Incoming message request from the client
 */
export interface AgentMessageRequest {
  /** The user's message to the agent */
  message: string;
  /** Unique identifier for the conversation session */
  session_id: string;
  /** Optional: Additional context or metadata */
  context?: Record<string, unknown>;
}

/**
 * Agent's response to the user
 */
export interface AgentMessageResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Response data or error information */
  data?: {
    /** The agent's generated response */
    response: string;
    /** Session identifier for tracking */
    session_id: string;
    /** List of plugins that were activated during processing */
    plugins_used: string[];
    /** Sources retrieved from the knowledge base */
    sources_used: RetrievedSource[];
    /** Processing metadata */
    metadata?: {
      /** Time taken to process the request */
      processing_time_ms: number;
      /** Token usage information */
      token_usage?: TokenUsage;
      /** Confidence score of the response */
      confidence_score?: number;
    };
  };
  /** Error information if success is false */
  error?: {
    /** Error message */
    message: string;
    /** Error code for client handling */
    code: string;
    /** Additional error details */
    details?: Record<string, unknown>;
  };
}

/**
 * Information about sources retrieved during RAG
 */
export interface RetrievedSource {
  /** Name of the source file */
  filename: string;
  /** How relevant this source is to the query (0-1) */
  relevance_score: number;
  /** The actual text content that was retrieved */
  chunk: string;
  /** Metadata about the chunk */
  metadata?: {
    /** Character position in the original file */
    start_pos?: number;
    /** Length of the original chunk */
    length?: number;
    /** Section or heading this chunk belongs to */
    section?: string;
  };
}

/**
 * Token usage information from LLM providers
 */
export interface TokenUsage {
  /** Tokens used in the prompt */
  prompt_tokens: number;
  /** Tokens generated in the response */
  completion_tokens: number;
  /** Total tokens used */
  total_tokens: number;
  /** Estimated cost in USD (if available) */
  estimated_cost?: number;
}

// ============================================================================
// SESSION AND MEMORY TYPES
// ============================================================================

/**
 * Represents a single message in a conversation
 */
export interface ConversationMessage {
  /** Unique identifier for this message */
  id: string;
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system';
  /** Content of the message */
  content: string;
  /** When this message was created */
  timestamp: Date;
  /** Optional metadata */
  metadata?: {
    /** Plugins used for this message */
    plugins_used?: string[];
    /** Sources used for this message */
    sources_used?: string[];
    /** Processing time for this message */
    processing_time_ms?: number;
  };
}

/**
 * Complete conversation session
 */
export interface ConversationSession {
  /** Unique session identifier */
  session_id: string;
  /** All messages in this session */
  messages: ConversationMessage[];
  /** When this session was created */
  created_at: Date;
  /** When this session was last updated */
  updated_at: Date;
  /** Session metadata */
  metadata?: {
    /** User identifier (if available) */
    user_id?: string;
    /** Session tags or categories */
    tags?: string[];
    /** Custom session data */
    custom_data?: Record<string, unknown>;
  };
}

/**
 * Summary of recent conversation context
 */
export interface ConversationSummary {
  /** Session identifier */
  session_id: string;
  /** Summarized context from recent messages */
  summary: string;
  /** Number of messages included in the summary */
  message_count: number;
  /** Key topics discussed */
  topics: string[];
  /** Last message timestamp */
  last_message_at: Date;
}

// ============================================================================
// AGENT PROCESSING TYPES
// ============================================================================

/**
 * Context passed to the agent for processing a request
 */
export interface AgentContext {
  /** The user's current message */
  current_message: string;
  /** Session identifier */
  session_id: string;
  /** Recent conversation history */
  conversation_history: ConversationMessage[];
  /** Summary of older conversation context */
  conversation_summary?: ConversationSummary;
  /** Retrieved content from knowledge base */
  retrieved_content: RetrievedSource[];
  /** Results from activated plugins */
  plugin_results: PluginExecutionResult[];
  /** Additional processing metadata */
  metadata: {
    /** Request timestamp */
    request_timestamp: Date;
    /** User's timezone (if available) */
    user_timezone?: string;
    /** Request origin information */
    request_origin?: string;
  };
}

/**
 * Result of the agent's processing
 */
export interface AgentProcessingResult {
  /** Generated response text */
  response: string;
  /** Confidence in the response quality (0-1) */
  confidence_score: number;
  /** Sources that influenced the response */
  sources_used: RetrievedSource[];
  /** Plugins that were executed */
  plugins_used: string[];
  /** Processing metadata */
  metadata: {
    /** Total processing time */
    processing_time_ms: number;
    /** Token usage information */
    token_usage?: TokenUsage;
    /** LLM provider used */
    llm_provider: string;
    /** Model name used */
    model_name: string;
  };
}

// ============================================================================
// PLUGIN EXECUTION TYPES
// ============================================================================

/**
 * Result from executing a plugin
 */
export interface PluginExecutionResult {
  /** Name of the plugin that was executed */
  plugin_name: string;
  /** Whether the plugin execution was successful */
  success: boolean;
  /** Result data from the plugin */
  result?: unknown;
  /** Error information if execution failed */
  error?: string;
  /** Time taken to execute the plugin */
  execution_time_ms: number;
  /** Additional metadata from the plugin */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Standardized error types for the agent system
 */
export enum AgentErrorCode {
  // Validation errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_SESSION_ID = 'MISSING_SESSION_ID',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  
  // LLM errors
  LLM_API_ERROR = 'LLM_API_ERROR',
  LLM_RATE_LIMIT = 'LLM_RATE_LIMIT',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  
  // RAG errors
  RAG_RETRIEVAL_ERROR = 'RAG_RETRIEVAL_ERROR',
  RAG_EMBEDDING_ERROR = 'RAG_EMBEDDING_ERROR',
  
  // Plugin errors
  PLUGIN_EXECUTION_ERROR = 'PLUGIN_EXECUTION_ERROR',
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  
  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MEMORY_ERROR = 'MEMORY_ERROR'
}

/**
 * Structured error information
 */
export interface AgentError {
  /** Error code for programmatic handling */
  code: AgentErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Stack trace (for debugging) */
  stack?: string;
  /** Timestamp when error occurred */
  timestamp: Date;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Agent configuration options
 */
export interface AgentConfig {
  /** Maximum number of messages to keep in memory per session */
  max_conversation_history: number;
  /** Maximum number of chunks to retrieve from RAG */
  max_rag_chunks: number;
  /** Default LLM provider to use */
  default_llm_provider: string;
  /** Default model name */
  default_model: string;
  /** Timeout for LLM requests in milliseconds */
  llm_timeout_ms: number;
  /** Whether to enable plugin system */
  enable_plugins: boolean;
  /** List of enabled plugins */
  enabled_plugins: string[];
  /** RAG configuration */
  rag_config: {
    /** Minimum similarity score for retrieval */
    min_similarity_score: number;
    /** Size of text chunks for embedding */
    chunk_size: number;
    /** Overlap between chunks */
    chunk_overlap: number;
  };
}

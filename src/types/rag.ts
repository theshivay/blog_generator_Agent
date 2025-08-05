/**
 * RAG (Retrieval-Augmented Generation) Types
 * 
 * This file contains type definitions for the RAG system, including
 * vector operations, embeddings, and knowledge base management.
 */

// ============================================================================
// VECTOR AND EMBEDDING TYPES
// ============================================================================

/**
 * A vector representation of text content
 */
export interface Vector {
  /** The numerical vector values */
  values: number[];
  /** Dimensionality of the vector */
  dimensions: number;
  /** Optional metadata about the vector */
  metadata?: {
    /** Source of the vector */
    source?: string;
    /** When the vector was created */
    created_at?: Date;
    /** Model used to generate the embedding */
    model?: string;
  };
}

/**
 * An embedded text chunk with its vector representation
 */
export interface EmbeddedChunk {
  /** Unique identifier for this chunk */
  id: string;
  /** The original text content */
  text: string;
  /** Vector representation of the text */
  embedding: Vector;
  /** Source file information */
  source: {
    /** Original filename */
    filename: string;
    /** Position in the original file */
    start_position: number;
    /** Length of the chunk */
    length: number;
    /** Section or heading this chunk belongs to */
    section?: string;
  };
  /** Additional metadata */
  metadata: {
    /** When this chunk was created */
    created_at: Date;
    /** Processing information */
    processing_info?: {
      /** Tokenizer used */
      tokenizer?: string;
      /** Number of tokens */
      token_count?: number;
      /** Processing version */
      version?: string;
    };
  };
}

/**
 * Configuration for text chunking
 */
export interface ChunkingConfig {
  /** Maximum size of each chunk in characters */
  max_chunk_size: number;
  /** Overlap between consecutive chunks */
  chunk_overlap: number;
  /** Strategy for chunking text */
  strategy: 'fixed_size' | 'sentence' | 'paragraph' | 'markdown_section';
  /** Preserve specific boundaries */
  preserve_boundaries?: {
    /** Keep sentences intact */
    sentences?: boolean;
    /** Keep paragraphs intact */
    paragraphs?: boolean;
    /** Keep markdown sections intact */
    markdown_sections?: boolean;
  };
}

// ============================================================================
// SIMILARITY AND RETRIEVAL TYPES
// ============================================================================

/**
 * Result of a similarity search
 */
export interface SimilarityResult {
  /** The embedded chunk that was matched */
  chunk: EmbeddedChunk;
  /** Similarity score (0-1, where 1 is perfect match) */
  similarity_score: number;
  /** Rank in the search results (1-based) */
  rank: number;
  /** Additional matching metadata */
  match_metadata?: {
    /** Which parts of the text contributed to the match */
    matching_terms?: string[];
    /** Explanation of why this chunk was selected */
    match_reason?: string;
  };
}

/**
 * Parameters for similarity search
 */
export interface SimilaritySearchParams {
  /** Query text to search for */
  query: string;
  /** Maximum number of results to return */
  top_k: number;
  /** Minimum similarity score to include */
  min_similarity_score?: number;
  /** Filters to apply to the search */
  filters?: {
    /** Specific filenames to search in */
    filenames?: string[];
    /** Specific sections to search in */
    sections?: string[];
    /** Date range for content */
    date_range?: {
      start?: Date;
      end?: Date;
    };
  };
  /** Whether to include metadata in results */
  include_metadata?: boolean;
}

/**
 * Configuration for the vector database
 */
export interface VectorDatabaseConfig {
  /** Type of vector database to use */
  type: 'memory' | 'pinecone' | 'chromadb' | 'custom';
  /** Configuration specific to the database type */
  config: {
    /** For memory-based storage */
    memory?: {
      /** Maximum number of vectors to store */
      max_vectors?: number;
      /** Whether to persist to disk */
      persist_to_disk?: boolean;
      /** Disk storage path */
      storage_path?: string;
    };
    /** For Pinecone */
    pinecone?: {
      /** API key */
      api_key: string;
      /** Environment */
      environment: string;
      /** Index name */
      index_name: string;
    };
    /** For ChromaDB */
    chromadb?: {
      /** Server URL */
      url: string;
      /** Collection name */
      collection_name: string;
      /** API key (if required) */
      api_key?: string;
    };
  };
}

// ============================================================================
// KNOWLEDGE BASE TYPES
// ============================================================================

/**
 * A document in the knowledge base
 */
export interface KnowledgeDocument {
  /** Unique document identifier */
  id: string;
  /** Original filename */
  filename: string;
  /** Document title */
  title: string;
  /** Full document content */
  content: string;
  /** Document type */
  type: 'markdown' | 'text' | 'html' | 'pdf';
  /** Document metadata */
  metadata: {
    /** When the document was added */
    created_at: Date;
    /** When the document was last updated */
    updated_at: Date;
    /** File size in bytes */
    file_size: number;
    /** Document language */
    language?: string;
    /** Author information */
    author?: string;
    /** Tags or categories */
    tags?: string[];
    /** Custom metadata */
    custom?: Record<string, unknown>;
  };
  /** Processing status */
  processing: {
    /** Whether the document has been chunked */
    chunked: boolean;
    /** Whether embeddings have been generated */
    embedded: boolean;
    /** Number of chunks created */
    chunk_count: number;
    /** Processing errors (if any) */
    errors?: string[];
  };
}

/**
 * Information about the knowledge base
 */
export interface KnowledgeBaseInfo {
  /** Total number of documents */
  document_count: number;
  /** Total number of chunks */
  chunk_count: number;
  /** Total size of all documents in bytes */
  total_size_bytes: number;
  /** Available document types */
  document_types: string[];
  /** Index statistics */
  index_stats: {
    /** Total number of vectors */
    vector_count: number;
    /** Vector dimensions */
    vector_dimensions: number;
    /** Index size in bytes */
    index_size_bytes: number;
    /** Last update timestamp */
    last_updated: Date;
  };
  /** Processing statistics */
  processing_stats: {
    /** Documents successfully processed */
    processed_documents: number;
    /** Documents with processing errors */
    failed_documents: number;
    /** Average processing time per document */
    avg_processing_time_ms: number;
  };
}

// ============================================================================
// EMBEDDING PROVIDER TYPES
// ============================================================================

/**
 * Configuration for embedding providers
 */
export interface EmbeddingProviderConfig {
  /** Provider type */
  provider: 'gemini' | 'huggingface' | 'cohere' | 'local';
  /** Model name to use */
  model: string;
  /** API configuration */
  api: {
    /** API key */
    key?: string;
    /** Base URL for the API */
    base_url?: string;
    /** Request timeout in milliseconds */
    timeout_ms?: number;
    /** Maximum retries on failure */
    max_retries?: number;
  };
  /** Model-specific parameters */
  parameters?: {
    /** Maximum input length */
    max_input_length?: number;
    /** Output dimensions */
    dimensions?: number;
    /** Normalization strategy */
    normalize?: boolean;
  };
}

/**
 * Request to generate embeddings
 */
export interface EmbeddingRequest {
  /** Text content to embed */
  texts: string[];
  /** Model to use (optional, falls back to config) */
  model?: string;
  /** Additional parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Response from embedding generation
 */
export interface EmbeddingResponse {
  /** Generated embeddings */
  embeddings: Vector[];
  /** Model used for generation */
  model: string;
  /** Token usage information */
  usage?: {
    /** Total tokens processed */
    total_tokens: number;
    /** Estimated cost */
    estimated_cost?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// RAG PROCESSING TYPES
// ============================================================================

/**
 * Context for RAG processing
 */
export interface RAGContext {
  /** The user's query */
  query: string;
  /** Current conversation context */
  conversation_context?: string[];
  /** Session information */
  session_id: string;
  /** Search parameters */
  search_params: SimilaritySearchParams;
  /** Processing preferences */
  preferences?: {
    /** Preferred content types */
    content_types?: string[];
    /** Recency preference (favor newer content) */
    recency_weight?: number;
    /** Diversity preference (avoid similar results) */
    diversity_weight?: number;
  };
}

/**
 * Result of RAG processing
 */
export interface RAGResult {
  /** Retrieved and ranked content chunks */
  retrieved_chunks: SimilarityResult[];
  /** Query analysis */
  query_analysis: {
    /** Detected intent or topic */
    intent?: string;
    /** Key terms extracted from query */
    key_terms: string[];
    /** Query complexity score */
    complexity_score: number;
  };
  /** Retrieval metadata */
  retrieval_metadata: {
    /** Total documents searched */
    documents_searched: number;
    /** Total chunks searched */
    chunks_searched: number;
    /** Search time in milliseconds */
    search_time_ms: number;
    /** Search strategy used */
    search_strategy: string;
  };
}

/**
 * Configuration for RAG processing
 */
export interface RAGConfig {
  /** Embedding configuration */
  embedding: EmbeddingProviderConfig;
  /** Vector database configuration */
  vector_db: VectorDatabaseConfig;
  /** Chunking configuration */
  chunking: ChunkingConfig;
  /** Search configuration */
  search: {
    /** Default number of chunks to retrieve */
    default_top_k: number;
    /** Default minimum similarity score */
    default_min_score: number;
    /** Enable query expansion */
    enable_query_expansion?: boolean;
    /** Enable reranking of results */
    enable_reranking?: boolean;
  };
  /** Performance settings */
  performance: {
    /** Cache embedding results */
    cache_embeddings: boolean;
    /** Cache search results */
    cache_search_results: boolean;
    /** Cache TTL in seconds */
    cache_ttl_seconds: number;
  };
}

/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * This service handles the retrieval and augmentation of content from
 * the knowledge base. It manages document storage, embedding generation,
 * similarity search, and context preparation for the LLM.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { 
  EmbeddedChunk, 
  SimilarityResult, 
  RAGContext, 
  RAGResult, 
  KnowledgeDocument, 
  ChunkingConfig 
} from '../types/rag';
import { LLMService } from './LLMService';
import { findSimilarChunks, validateVector } from '../utils/vectorUtils';
import { chunkText, cleanText, stripMarkdown, extractKeyTerms } from '../utils/textUtils';
import { logger } from '../utils/logger';

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

export interface RAGServiceConfig {
  /** Directory to store processed embeddings and chunks */
  dataDirectory: string;
  /** Chunking configuration */
  chunkingConfig: ChunkingConfig;
  /** LLM service for embedding generation */
  llmService: LLMService;
  /** Minimum similarity score for retrieval */
  minSimilarityScore: number;
  /** Default number of chunks to retrieve */
  defaultTopK: number;
  /** Whether to cache embeddings */
  cacheEmbeddings: boolean;
}

// ============================================================================
// RAG SERVICE CLASS
// ============================================================================

export class RAGService {
  private config: RAGServiceConfig;
  private embeddedChunks: EmbeddedChunk[] = [];
  private documentsIndex: Map<string, KnowledgeDocument> = new Map();
  private isInitialized = false;

  constructor(config: RAGServiceConfig) {
    this.config = config;
    this.ensureDataDirectory();
    logger.info('RAG Service initialized', {
      dataDirectory: config.dataDirectory,
      chunkingStrategy: config.chunkingConfig.strategy,
      minSimilarityScore: config.minSimilarityScore
    });
  }

  /**
   * Initialize the RAG service by loading existing data
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.loadExistingData();
      this.isInitialized = true;
      
      const duration = Date.now() - startTime;
      logger.info('RAG Service initialization completed', {
        chunksLoaded: this.embeddedChunks.length,
        documentsLoaded: this.documentsIndex.size,
        duration_ms: duration
      });
    } catch (error) {
      logger.error('RAG Service initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process and add documents to the knowledge base
   */
  async processDocuments(documents: Array<{
    filename: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    const startTime = Date.now();
    
    logger.info('Processing documents for RAG', {
      documentCount: documents.length
    });

    for (const doc of documents) {
      try {
        await this.processDocument(doc.filename, doc.content, doc.metadata);
      } catch (error) {
        logger.error(`Failed to process document: ${doc.filename}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue processing other documents
      }
    }

    // Save processed data
    await this.saveProcessedData();
    
    const duration = Date.now() - startTime;
    logger.info('Document processing completed', {
      totalChunks: this.embeddedChunks.length,
      duration_ms: duration
    });
  }

  /**
   * Retrieve relevant content for a query
   */
  async retrieveContent(context: RAGContext): Promise<RAGResult> {
    if (!this.isInitialized) {
      throw new Error('RAG Service not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    
    try {
      logger.debug('Retrieving content for query', {
        query: context.query.substring(0, 100) + '...',
        sessionId: context.session_id,
        topK: context.search_params.top_k
      });

      // Generate embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(context.query);
      
      // Perform similarity search
      const similarChunks = findSimilarChunks(
        queryEmbedding,
        this.embeddedChunks,
        context.search_params.top_k,
        context.search_params.min_similarity_score || this.config.minSimilarityScore
      );

      // Apply filters if specified
      const filteredChunks = this.applyFilters(similarChunks, context.search_params.filters);

      // Analyze the query
      const queryAnalysis = this.analyzeQuery(context.query);

      const duration = Date.now() - startTime;
      
      const result: RAGResult = {
        retrieved_chunks: filteredChunks,
        query_analysis: queryAnalysis,
        retrieval_metadata: {
          documents_searched: this.documentsIndex.size,
          chunks_searched: this.embeddedChunks.length,
          search_time_ms: duration,
          search_strategy: 'cosine_similarity'
        }
      };

      logger.info('Content retrieval completed', {
        chunksRetrieved: filteredChunks.length,
        avgSimilarity: filteredChunks.length > 0 
          ? filteredChunks.reduce((sum, chunk) => sum + chunk.similarity_score, 0) / filteredChunks.length 
          : 0,
        duration_ms: duration
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Content retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration
      });
      throw error;
    }
  }

  /**
   * Get information about the knowledge base
   */
  getKnowledgeBaseInfo(): {
    documentCount: number;
    chunkCount: number;
    averageChunkSize: number;
    availableDocuments: string[];
  } {
    const totalChars = this.embeddedChunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
    const averageChunkSize = this.embeddedChunks.length > 0 ? totalChars / this.embeddedChunks.length : 0;

    return {
      documentCount: this.documentsIndex.size,
      chunkCount: this.embeddedChunks.length,
      averageChunkSize: Math.round(averageChunkSize),
      availableDocuments: Array.from(this.documentsIndex.keys())
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async processDocument(
    filename: string, 
    content: string, 
    metadata?: Record<string, unknown>
  ): Promise<void> {
    logger.debug(`Processing document: ${filename}`);

    // Clean the content
    const cleanedContent = cleanText(content);
    const strippedContent = stripMarkdown(cleanedContent);

    // Create knowledge document entry
    const document: KnowledgeDocument = {
      id: this.generateDocumentId(filename),
      filename,
      title: this.extractTitle(content) || filename,
      content: cleanedContent,
      type: this.detectDocumentType(filename),
      metadata: {
        created_at: new Date(),
        updated_at: new Date(),
        file_size: content.length,
        tags: extractKeyTerms(strippedContent, 5),
        ...metadata
      },
      processing: {
        chunked: false,
        embedded: false,
        chunk_count: 0
      }
    };

    // Chunk the document
    const chunks = chunkText(strippedContent, this.config.chunkingConfig, filename);
    document.processing.chunked = true;
    document.processing.chunk_count = chunks.length;

    logger.debug(`Generated ${chunks.length} chunks for ${filename}`);

    // Generate embeddings for chunks
    const chunkTexts = chunks.map(chunk => chunk.text);
    const embeddings = await this.config.llmService.generateEmbeddings(chunkTexts);

    // Create embedded chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      const embeddedChunk: EmbeddedChunk = {
        id: chunk.id,
        text: chunk.text,
        embedding: {
          values: embedding,
          dimensions: embedding.length
        },
        source: chunk.section ? {
          filename,
          start_position: chunk.startPosition,
          length: chunk.length,
          section: chunk.section
        } : {
          filename,
          start_position: chunk.startPosition,
          length: chunk.length
        },
        metadata: {
          created_at: new Date(),
          processing_info: {
            version: '1.0'
          }
        }
      };

      this.embeddedChunks.push(embeddedChunk);
    }

    document.processing.embedded = true;
    this.documentsIndex.set(filename, document);

    logger.debug(`Successfully processed document: ${filename}`, {
      chunks: chunks.length,
      totalSize: content.length
    });
  }

  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const cleanedQuery = cleanText(query);
      const embeddings = await this.config.llmService.generateEmbeddings([cleanedQuery]);
      
      if (!embeddings || embeddings.length === 0) {
        throw new Error('No embedding generated for query');
      }

      const embedding = embeddings[0];
      validateVector(embedding);
      
      return embedding;
    } catch (error) {
      logger.error('Failed to generate query embedding', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private applyFilters(
    chunks: SimilarityResult[], 
    filters?: {
      filenames?: string[];
      sections?: string[];
      date_range?: { start?: Date; end?: Date };
    }
  ): SimilarityResult[] {
    if (!filters) return chunks;

    return chunks.filter(result => {
      // Filter by filename
      if (filters.filenames && filters.filenames.length > 0) {
        if (!filters.filenames.includes(result.chunk.source.filename)) {
          return false;
        }
      }

      // Filter by section
      if (filters.sections && filters.sections.length > 0) {
        if (!result.chunk.source.section || 
            !filters.sections.includes(result.chunk.source.section)) {
          return false;
        }
      }

      // Filter by date range
      if (filters.date_range) {
        const chunkDate = result.chunk.metadata.created_at;
        
        if (filters.date_range.start && chunkDate < filters.date_range.start) {
          return false;
        }
        
        if (filters.date_range.end && chunkDate > filters.date_range.end) {
          return false;
        }
      }

      return true;
    });
  }

  private analyzeQuery(query: string): {
    intent?: string;
    key_terms: string[];
    complexity_score: number;
  } {
    const keyTerms = extractKeyTerms(query, 5);
    const wordCount = query.split(/\s+/).length;
    const complexityScore = Math.min(wordCount / 20, 1); // Normalize to 0-1

    // Simple intent detection based on keywords
    let intent: string | undefined;
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('how') || queryLower.includes('tutorial') || queryLower.includes('guide')) {
      intent = 'how_to';
    } else if (queryLower.includes('what') || queryLower.includes('definition')) {
      intent = 'definition';
    } else if (queryLower.includes('why') || queryLower.includes('reason')) {
      intent = 'explanation';
    } else if (queryLower.includes('example') || queryLower.includes('sample')) {
      intent = 'example';
    }

    const result: { intent?: string; key_terms: string[]; complexity_score: number } = {
      key_terms: keyTerms,
      complexity_score: complexityScore
    };

    if (intent) {
      result.intent = intent;
    }

    return result;
  }

  private ensureDataDirectory(): void {
    if (!existsSync(this.config.dataDirectory)) {
      mkdirSync(this.config.dataDirectory, { recursive: true });
      logger.info(`Created data directory: ${this.config.dataDirectory}`);
    }
  }

  private async loadExistingData(): Promise<void> {
    const chunksPath = join(this.config.dataDirectory, 'chunks.json');
    const documentsPath = join(this.config.dataDirectory, 'documents.json');

    // Load chunks
    if (existsSync(chunksPath)) {
      try {
        const chunksData = readFileSync(chunksPath, 'utf-8');
        this.embeddedChunks = JSON.parse(chunksData);
        
        // Convert date strings back to Date objects
        this.embeddedChunks.forEach(chunk => {
          chunk.metadata.created_at = new Date(chunk.metadata.created_at);
        });
        
        logger.info(`Loaded ${this.embeddedChunks.length} chunks from cache`);
      } catch (error) {
        logger.warn('Failed to load cached chunks', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        this.embeddedChunks = [];
      }
    }

    // Load documents index
    if (existsSync(documentsPath)) {
      try {
        const documentsData = readFileSync(documentsPath, 'utf-8');
        const documents: KnowledgeDocument[] = JSON.parse(documentsData);
        
        // Convert to Map and restore Date objects
        this.documentsIndex.clear();
        documents.forEach(doc => {
          doc.metadata.created_at = new Date(doc.metadata.created_at);
          doc.metadata.updated_at = new Date(doc.metadata.updated_at);
          this.documentsIndex.set(doc.filename, doc);
        });
        
        logger.info(`Loaded ${this.documentsIndex.size} documents from cache`);
      } catch (error) {
        logger.warn('Failed to load cached documents', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        this.documentsIndex.clear();
      }
    }
  }

  private async saveProcessedData(): Promise<void> {
    if (!this.config.cacheEmbeddings) {
      return;
    }

    try {
      const chunksPath = join(this.config.dataDirectory, 'chunks.json');
      const documentsPath = join(this.config.dataDirectory, 'documents.json');

      // Save chunks
      writeFileSync(chunksPath, JSON.stringify(this.embeddedChunks, null, 2));
      
      // Save documents
      const documentsArray = Array.from(this.documentsIndex.values());
      writeFileSync(documentsPath, JSON.stringify(documentsArray, null, 2));

      logger.info('Saved processed data to cache', {
        chunks: this.embeddedChunks.length,
        documents: this.documentsIndex.size
      });
    } catch (error) {
      logger.error('Failed to save processed data', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private generateDocumentId(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }

  private extractTitle(content: string): string | null {
    // Try to extract title from markdown heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Try to extract from frontmatter
    const frontmatterMatch = content.match(/^---\s*\ntitle:\s*['"]?([^'"]*?)['"]?\s*\n/m);
    if (frontmatterMatch) {
      return frontmatterMatch[1].trim();
    }

    return null;
  }

  private detectDocumentType(filename: string): 'markdown' | 'text' | 'html' | 'pdf' {
    const extension = filename.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'html':
      case 'htm':
        return 'html';
      case 'pdf':
        return 'pdf';
      default:
        return 'text';
    }
  }

  /**
   * Create RAG service from configuration
   */
  static create(config: Partial<RAGServiceConfig> & { llmService: LLMService }): RAGService {
    const defaultConfig: RAGServiceConfig = {
      dataDirectory: './data',
      chunkingConfig: {
        max_chunk_size: 1000,
        chunk_overlap: 200,
        strategy: 'markdown_section',
        preserve_boundaries: {
          sentences: true,
          paragraphs: true,
          markdown_sections: true
        }
      },
      llmService: config.llmService,
      minSimilarityScore: 0.3,
      defaultTopK: 5,
      cacheEmbeddings: true
    };

    return new RAGService({ ...defaultConfig, ...config });
  }
}

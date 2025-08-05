/**
 * Memory Service
 * 
 * This service manages conversation memory for AI agent sessions.
 * It stores conversation history, manages session data, and provides
 * context summarization for long conversations.
 */

import { 
  ConversationSession, 
  ConversationMessage, 
  ConversationSummary,
  AgentConfig 
} from '../types/agent';
import { logger } from '../utils/logger';

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

export interface MemoryServiceConfig {
  /** Maximum number of messages to keep in memory per session */
  maxMessagesPerSession: number;
  /** After how many messages to create a summary */
  summaryThreshold: number;
  /** How long to keep inactive sessions (in milliseconds) */
  sessionTTL: number;
  /** Whether to persist sessions to disk */
  persistSessions: boolean;
  /** Directory to store session data (if persisting) */
  dataDirectory?: string;
}

// ============================================================================
// MEMORY SERVICE CLASS
// ============================================================================

export class MemoryService {
  private config: MemoryServiceConfig;
  private sessions: Map<string, ConversationSession> = new Map();
  private sessionSummaries: Map<string, ConversationSummary> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: MemoryServiceConfig) {
    this.config = config;
    this.startCleanupInterval();
    
    logger.info('Memory Service initialized', {
      maxMessagesPerSession: config.maxMessagesPerSession,
      summaryThreshold: config.summaryThreshold,
      sessionTTL: config.sessionTTL
    });
  }

  /**
   * Add a new message to a session
   */
  addMessage(
    sessionId: string, 
    role: 'user' | 'assistant' | 'system', 
    content: string,
    metadata?: Record<string, unknown>
  ): ConversationMessage {
    const message: ConversationMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      metadata: metadata || {}
    };

    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createNewSession(sessionId);
      this.sessions.set(sessionId, session);
      logger.debug(`Created new session: ${sessionId}`);
    }

    // Add message to session
    session.messages.push(message);
    session.updated_at = new Date();

    // Manage session size
    this.manageSessionSize(session);

    logger.debug(`Added message to session ${sessionId}`, {
      role,
      messageLength: content.length,
      totalMessages: session.messages.length
    });

    return message;
  }

  /**
   * Get conversation history for a session
   */
  getConversationHistory(
    sessionId: string, 
    limit?: number
  ): ConversationMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const messages = session.messages;
    if (limit && limit > 0) {
      return messages.slice(-limit);
    }

    return messages;
  }

  /**
   * Get recent context for a session (for prompt engineering)
   */
  getRecentContext(
    sessionId: string, 
    maxMessages: number = 6
  ): {
    recentMessages: ConversationMessage[];
    summary?: ConversationSummary;
    totalMessages: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        recentMessages: [],
        totalMessages: 0
      };
    }

    const recentMessages = session.messages.slice(-maxMessages);
    const summary = this.sessionSummaries.get(sessionId);

    const result: { recentMessages: ConversationMessage[]; summary?: ConversationSummary; totalMessages: number } = {
      recentMessages,
      totalMessages: session.messages.length
    };

    if (summary) {
      result.summary = summary;
    }

    return result;
  }

  /**
   * Create or update a conversation summary
   */
  updateSessionSummary(
    sessionId: string, 
    summary: string, 
    topics: string[]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Attempted to update summary for non-existent session: ${sessionId}`);
      return;
    }

    const conversationSummary: ConversationSummary = {
      session_id: sessionId,
      summary,
      message_count: session.messages.length,
      topics,
      last_message_at: session.updated_at
    };

    this.sessionSummaries.set(sessionId, conversationSummary);
    
    logger.debug(`Updated summary for session ${sessionId}`, {
      topics: topics.length,
      messageCount: session.messages.length
    });
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    const now = new Date().getTime();
    const cutoff = now - this.config.sessionTTL;

    return Array.from(this.sessions.entries())
      .filter(([_, session]) => session.updated_at.getTime() > cutoff)
      .map(([sessionId, _]) => sessionId);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    sessionAge: number;
    lastActivity: Date;
    hasSummary: boolean;
    estimatedTokens: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const messageCount = session.messages.length;
    const sessionAge = Date.now() - session.created_at.getTime();
    const lastActivity = session.updated_at;
    const hasSummary = this.sessionSummaries.has(sessionId);
    
    // Rough token estimation (4 chars per token)
    const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);

    return {
      messageCount,
      sessionAge,
      lastActivity,
      hasSummary,
      estimatedTokens
    };
  }

  /**
   * Clear a specific session
   */
  clearSession(sessionId: string): boolean {
    const sessionExists = this.sessions.has(sessionId);
    
    this.sessions.delete(sessionId);
    this.sessionSummaries.delete(sessionId);
    
    if (sessionExists) {
      logger.info(`Cleared session: ${sessionId}`);
    }
    
    return sessionExists;
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): number {
    const count = this.sessions.size;
    
    this.sessions.clear();
    this.sessionSummaries.clear();
    
    logger.info(`Cleared all sessions`, { count });
    
    return count;
  }

  /**
   * Export session data
   */
  exportSession(sessionId: string): ConversationSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Return a deep copy to prevent external modification
    return JSON.parse(JSON.stringify(session));
  }

  /**
   * Import session data
   */
  importSession(sessionData: ConversationSession): void {
    // Validate session data
    if (!sessionData.session_id || !sessionData.messages) {
      throw new Error('Invalid session data');
    }

    // Convert date strings back to Date objects if needed
    const session: ConversationSession = {
      ...sessionData,
      created_at: new Date(sessionData.created_at),
      updated_at: new Date(sessionData.updated_at),
      messages: sessionData.messages.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    };

    this.sessions.set(session.session_id, session);
    
    logger.info(`Imported session: ${session.session_id}`, {
      messageCount: session.messages.length
    });
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    totalSessions: number;
    totalMessages: number;
    totalSummaries: number;
    activeSessions: number;
    memoryUsageEstimate: number;
  } {
    const totalSessions = this.sessions.size;
    const totalMessages = Array.from(this.sessions.values())
      .reduce((sum, session) => sum + session.messages.length, 0);
    const totalSummaries = this.sessionSummaries.size;
    const activeSessions = this.getActiveSessions().length;

    // Rough memory usage estimate in bytes
    let memoryUsageEstimate = 0;
    for (const session of this.sessions.values()) {
      for (const message of session.messages) {
        memoryUsageEstimate += message.content.length * 2; // UTF-16
        memoryUsageEstimate += 200; // Overhead for message object
      }
      memoryUsageEstimate += 500; // Overhead for session object
    }

    return {
      totalSessions,
      totalMessages,
      totalSummaries,
      activeSessions,
      memoryUsageEstimate
    };
  }

  /**
   * Cleanup method to be called on shutdown
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.config.persistSessions) {
      this.persistAllSessions();
    }

    logger.info('Memory Service cleanup completed');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createNewSession(sessionId: string): ConversationSession {
    const now = new Date();
    
    return {
      session_id: sessionId,
      messages: [],
      created_at: now,
      updated_at: now,
      metadata: {}
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private manageSessionSize(session: ConversationSession): void {
    // If we exceed the message limit, create a summary and remove old messages
    if (session.messages.length > this.config.maxMessagesPerSession) {
      const messagesToSummarize = session.messages.slice(0, -this.config.summaryThreshold);
      
      // Create a simple summary (in a real implementation, you might use an LLM)
      const summary = this.createSimpleSummary(messagesToSummarize);
      const topics = this.extractTopics(messagesToSummarize);
      
      this.updateSessionSummary(session.session_id, summary, topics);
      
      // Keep only recent messages
      session.messages = session.messages.slice(-this.config.summaryThreshold);
      
      logger.debug(`Trimmed session ${session.session_id}`, {
        messagesRemoved: messagesToSummarize.length,
        messagesRemaining: session.messages.length
      });
    }
  }

  private createSimpleSummary(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return 'No previous conversation.';
    }

    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    
    return `Previous conversation included ${userMessages} user messages and ${assistantMessages} assistant responses covering various topics.`;
  }

  private extractTopics(messages: ConversationMessage[]): string[] {
    const topics = new Set<string>();
    
    for (const message of messages) {
      if (message.role === 'user') {
        // Simple keyword extraction (in reality, you'd use more sophisticated NLP)
        const words = message.content.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 3);
        
        words.forEach(word => topics.add(word));
      }
    }
    
    return Array.from(topics).slice(0, 5); // Return top 5 topics
  }

  private startCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  private cleanupExpiredSessions(): void {
    const now = new Date().getTime();
    const cutoff = now - this.config.sessionTTL;
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.updated_at.getTime() < cutoff) {
        this.sessions.delete(sessionId);
        this.sessionSummaries.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up expired sessions`, { count: cleanedCount });
    }
  }

  private persistAllSessions(): void {
    // In a real implementation, you would save to disk/database
    // For now, we'll just log that persistence would happen
    logger.info('Session persistence requested', {
      sessionCount: this.sessions.size
    });
  }

  /**
   * Create memory service from agent configuration
   */
  static fromConfig(config: AgentConfig): MemoryService {
    const memoryConfig: MemoryServiceConfig = {
      maxMessagesPerSession: config.max_conversation_history,
      summaryThreshold: Math.floor(config.max_conversation_history * 0.7),
      sessionTTL: 24 * 60 * 60 * 1000, // 24 hours
      persistSessions: false,
      dataDirectory: './data/sessions'
    };

    return new MemoryService(memoryConfig);
  }

  /**
   * Create memory service with default configuration
   */
  static createDefault(): MemoryService {
    const defaultConfig: MemoryServiceConfig = {
      maxMessagesPerSession: 20,
      summaryThreshold: 12,
      sessionTTL: 24 * 60 * 60 * 1000, // 24 hours
      persistSessions: false
    };

    return new MemoryService(defaultConfig);
  }
}

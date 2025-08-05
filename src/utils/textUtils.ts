/**
 * Text Processing Utilities
 * 
 * This module provides utilities for text processing including
 * chunking, cleaning, and preparation for embedding generation.
 */

import { ChunkingConfig } from '../types/rag';

// ============================================================================
// TEXT CHUNKING FUNCTIONS
// ============================================================================

/**
 * Split text into chunks based on configuration
 * 
 * @param text The input text to chunk
 * @param config Chunking configuration
 * @param sourceFilename Source filename for metadata
 * @returns Array of text chunks with metadata
 */
export function chunkText(
  text: string,
  config: ChunkingConfig,
  sourceFilename: string = 'unknown'
): Array<{
  id: string;
  text: string;
  startPosition: number;
  length: number;
  section?: string;
}> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  switch (config.strategy) {
    case 'fixed_size':
      return chunkByFixedSize(text, config, sourceFilename);
    case 'sentence':
      return chunkBySentence(text, config, sourceFilename);
    case 'paragraph':
      return chunkByParagraph(text, config, sourceFilename);
    case 'markdown_section':
      return chunkByMarkdownSection(text, config, sourceFilename);
    default:
      throw new Error(`Unsupported chunking strategy: ${config.strategy}`);
  }
}

/**
 * Chunk text by fixed size with overlap
 */
function chunkByFixedSize(
  text: string,
  config: ChunkingConfig,
  sourceFilename: string
): Array<{
  id: string;
  text: string;
  startPosition: number;
  length: number;
}> {
  const chunks: Array<{
    id: string;
    text: string;
    startPosition: number;
    length: number;
  }> = [];

  let position = 0;
  let chunkIndex = 0;

  while (position < text.length) {
    const endPosition = Math.min(position + config.max_chunk_size, text.length);
    let chunkText = text.slice(position, endPosition);

    // If we're not at the end and preserve boundaries is enabled
    if (endPosition < text.length && config.preserve_boundaries?.sentences) {
      // Try to end at a sentence boundary
      const lastSentenceEnd = findLastSentenceEnd(chunkText);
      if (lastSentenceEnd > chunkText.length * 0.5) { // Only if we don't lose too much text
        chunkText = chunkText.slice(0, lastSentenceEnd);
      }
    }

    if (chunkText.trim().length > 0) {
      chunks.push({
        id: generateChunkId(sourceFilename, chunkIndex),
        text: chunkText.trim(),
        startPosition: position,
        length: chunkText.length
      });
      chunkIndex++;
    }

    // Move position forward, accounting for overlap
    position = endPosition - config.chunk_overlap;
    if (position <= 0) position = endPosition;
  }

  return chunks;
}

/**
 * Chunk text by sentences
 */
function chunkBySentence(
  text: string,
  config: ChunkingConfig,
  sourceFilename: string
): Array<{
  id: string;
  text: string;
  startPosition: number;
  length: number;
}> {
  const sentences = splitIntoSentences(text);
  const chunks: Array<{
    id: string;
    text: string;
    startPosition: number;
    length: number;
  }> = [];

  let currentChunk = '';
  let chunkStartPosition = 0;
  let chunkIndex = 0;
  let sentencePosition = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

    if (potentialChunk.length <= config.max_chunk_size) {
      if (currentChunk === '') {
        chunkStartPosition = sentencePosition;
      }
      currentChunk = potentialChunk;
    } else {
      // Save current chunk if it's not empty
      if (currentChunk.trim().length > 0) {
        chunks.push({
          id: generateChunkId(sourceFilename, chunkIndex),
          text: currentChunk.trim(),
          startPosition: chunkStartPosition,
          length: currentChunk.length
        });
        chunkIndex++;
      }

      // Start new chunk with current sentence
      currentChunk = sentence;
      chunkStartPosition = sentencePosition;
    }

    sentencePosition += sentence.length + 1; // +1 for space/separator
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: generateChunkId(sourceFilename, chunkIndex),
      text: currentChunk.trim(),
      startPosition: chunkStartPosition,
      length: currentChunk.length
    });
  }

  return chunks;
}

/**
 * Chunk text by paragraphs
 */
function chunkByParagraph(
  text: string,
  config: ChunkingConfig,
  sourceFilename: string
): Array<{
  id: string;
  text: string;
  startPosition: number;
  length: number;
}> {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: Array<{
    id: string;
    text: string;
    startPosition: number;
    length: number;
  }> = [];

  let currentChunk = '';
  let chunkStartPosition = 0;
  let chunkIndex = 0;
  let textPosition = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + trimmedParagraph;

    if (potentialChunk.length <= config.max_chunk_size) {
      if (currentChunk === '') {
        chunkStartPosition = textPosition;
      }
      currentChunk = potentialChunk;
    } else {
      // Save current chunk if it's not empty
      if (currentChunk.trim().length > 0) {
        chunks.push({
          id: generateChunkId(sourceFilename, chunkIndex),
          text: currentChunk.trim(),
          startPosition: chunkStartPosition,
          length: currentChunk.length
        });
        chunkIndex++;
      }

      // If single paragraph is too large, split it by sentences
      if (trimmedParagraph.length > config.max_chunk_size) {
        const sentenceChunks = chunkBySentence(trimmedParagraph, config, sourceFilename);
        for (const sentenceChunk of sentenceChunks) {
          chunks.push({
            ...sentenceChunk,
            id: generateChunkId(sourceFilename, chunkIndex),
            startPosition: textPosition + sentenceChunk.startPosition
          });
          chunkIndex++;
        }
        currentChunk = '';
      } else {
        // Start new chunk with current paragraph
        currentChunk = trimmedParagraph;
        chunkStartPosition = textPosition;
      }
    }

    // Update position (account for paragraph separators)
    textPosition += paragraph.length + 2; // +2 for \n\n
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: generateChunkId(sourceFilename, chunkIndex),
      text: currentChunk.trim(),
      startPosition: chunkStartPosition,
      length: currentChunk.length
    });
  }

  return chunks;
}

/**
 * Chunk text by markdown sections
 */
function chunkByMarkdownSection(
  text: string,
  config: ChunkingConfig,
  sourceFilename: string
): Array<{
  id: string;
  text: string;
  startPosition: number;
  length: number;
  section?: string;
}> {
  const sections = parseMarkdownSections(text);
  const chunks: Array<{
    id: string;
    text: string;
    startPosition: number;
    length: number;
    section?: string;
  }> = [];

  let chunkIndex = 0;

  for (const section of sections) {
    if (section.content.length <= config.max_chunk_size) {
      // Section fits in one chunk
      chunks.push({
        id: generateChunkId(sourceFilename, chunkIndex),
        text: section.content.trim(),
        startPosition: section.startPosition,
        length: section.content.length,
        section: section.heading
      });
      chunkIndex++;
    } else {
      // Section is too large, split it further
      const subChunks = chunkByParagraph(section.content, config, sourceFilename);
      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          id: generateChunkId(sourceFilename, chunkIndex),
          startPosition: section.startPosition + subChunk.startPosition,
          section: section.heading
        });
        chunkIndex++;
      }
    }
  }

  return chunks;
}

// ============================================================================
// TEXT PROCESSING HELPERS
// ============================================================================

/**
 * Split text into sentences using basic punctuation rules
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitting - could be improved with a proper NLP library
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * Find the last sentence ending in a text chunk
 */
function findLastSentenceEnd(text: string): number {
  const sentenceEnders = /[.!?]/g;
  let lastMatch = -1;
  let match;

  while ((match = sentenceEnders.exec(text)) !== null) {
    lastMatch = match.index + 1;
  }

  return lastMatch;
}

/**
 * Parse markdown into sections based on headings
 */
function parseMarkdownSections(text: string): Array<{
  heading: string;
  content: string;
  startPosition: number;
  level: number;
}> {
  const lines = text.split('\n');
  const sections: Array<{
    heading: string;
    content: string;
    startPosition: number;
    level: number;
  }> = [];

  let currentSection: {
    heading: string;
    content: string;
    startPosition: number;
    level: number;
  } | null = null;
  let position = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        heading: headingMatch[2],
        content: '',
        startPosition: position,
        level: headingMatch[1].length
      };
    } else if (currentSection) {
      // Add line to current section
      currentSection.content += line + '\n';
    } else {
      // Content before first heading - create a default section
      if (line.trim().length > 0 && sections.length === 0) {
        currentSection = {
          heading: 'Introduction',
          content: line + '\n',
          startPosition: position,
          level: 0
        };
      }
    }
    
    position += line.length + 1; // +1 for newline
  }

  // Add the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Generate a unique chunk ID
 */
function generateChunkId(sourceFilename: string, index: number): string {
  const basename = sourceFilename.replace(/\.[^/.]+$/, ''); // Remove extension
  return `${basename}_chunk_${index.toString().padStart(4, '0')}`;
}

// ============================================================================
// TEXT CLEANING AND NORMALIZATION
// ============================================================================

/**
 * Clean and normalize text for processing
 */
export function cleanText(text: string): string {
  if (!text) return '';

  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Normalize dashes
    .replace(/[—–]/g, '-')
    // Normalize ellipsis
    .replace(/…/g, '...')
    // Trim
    .trim();
}

/**
 * Remove markdown formatting while preserving content
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  return text
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules
    .replace(/^---+\s*$/gm, '')
    // Remove blockquotes
    .replace(/^>\s*/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Extract key terms from text for indexing
 */
export function extractKeyTerms(text: string, maxTerms: number = 10): string[] {
  if (!text) return [];

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !isStopWord(word));

  // Count word frequency
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  // Sort by frequency and return top terms
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(entry => entry[0]);
}

/**
 * Check if a word is a stop word (common words to ignore)
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'among', 'through',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'can', 'must', 'shall', 'this', 'that', 'these', 'those', 'i', 'you',
    'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
  ]);

  return stopWords.has(word.toLowerCase());
}

/**
 * Calculate reading time estimate for text
 */
export function estimateReadingTime(text: string, wordsPerMinute: number = 200): number {
  if (!text) return 0;

  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Get text statistics
 */
export function getTextStatistics(text: string): {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  readingTimeMinutes: number;
} {
  if (!text) {
    return {
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      paragraphs: 0,
      readingTimeMinutes: 0
    };
  }

  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;
  const words = text.split(/\s+/).filter(word => word.length > 0).length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  const readingTimeMinutes = estimateReadingTime(text);

  return {
    characters,
    charactersNoSpaces,
    words,
    sentences,
    paragraphs,
    readingTimeMinutes
  };
}

/**
 * Vector Utilities
 * 
 * This module provides utilities for vector operations including
 * cosine similarity calculations, vector normalization, and other
 * mathematical operations needed for the RAG system.
 */

import { EmbeddedChunk, SimilarityResult } from '../types/rag';

// ============================================================================
// VECTOR MATHEMATICAL OPERATIONS
// ============================================================================

/**
 * Calculate the cosine similarity between two vectors
 * 
 * Cosine similarity measures the cosine of the angle between two vectors.
 * It ranges from -1 to 1, where 1 means the vectors are identical in direction,
 * 0 means they are orthogonal, and -1 means they are opposite.
 * 
 * @param vectorA First vector
 * @param vectorB Second vector
 * @returns Cosine similarity score between -1 and 1
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  // Validate inputs
  if (!vectorA || !vectorB) {
    throw new Error('Both vectors must be provided');
  }
  
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same dimensions');
  }
  
  if (vectorA.length === 0) {
    throw new Error('Vectors cannot be empty');
  }

  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  // Calculate magnitudes
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < vectorA.length; i++) {
    magnitudeA += vectorA[i] * vectorA[i];
    magnitudeB += vectorB[i] * vectorB[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  // Handle zero magnitude vectors
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  // Calculate cosine similarity
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Normalize a vector to unit length
 * 
 * @param vector Input vector
 * @returns Normalized vector
 */
export function normalizeVector(vector: number[]): number[] {
  if (!vector || vector.length === 0) {
    throw new Error('Vector cannot be empty');
  }

  // Calculate magnitude
  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }
  magnitude = Math.sqrt(magnitude);

  // Handle zero magnitude
  if (magnitude === 0) {
    return vector.slice(); // Return copy of original vector
  }

  // Normalize
  return vector.map(value => value / magnitude);
}

/**
 * Calculate the Euclidean distance between two vectors
 * 
 * @param vectorA First vector
 * @param vectorB Second vector
 * @returns Euclidean distance
 */
export function euclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (!vectorA || !vectorB) {
    throw new Error('Both vectors must be provided');
  }
  
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate the Manhattan distance between two vectors
 * 
 * @param vectorA First vector
 * @param vectorB Second vector
 * @returns Manhattan distance
 */
export function manhattanDistance(vectorA: number[], vectorB: number[]): number {
  if (!vectorA || !vectorB) {
    throw new Error('Both vectors must be provided');
  }
  
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    sum += Math.abs(vectorA[i] - vectorB[i]);
  }

  return sum;
}

// ============================================================================
// SIMILARITY SEARCH OPERATIONS
// ============================================================================

/**
 * Find the most similar chunks to a query vector
 * 
 * @param queryVector The query vector to search for
 * @param chunks Array of embedded chunks to search through
 * @param topK Number of top results to return
 * @param minSimilarity Minimum similarity threshold
 * @returns Array of similarity results sorted by relevance
 */
export function findSimilarChunks(
  queryVector: number[],
  chunks: EmbeddedChunk[],
  topK: number = 5,
  minSimilarity: number = 0.0
): SimilarityResult[] {
  if (!queryVector || queryVector.length === 0) {
    throw new Error('Query vector cannot be empty');
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  if (topK <= 0) {
    throw new Error('topK must be greater than 0');
  }

  // Calculate similarities for all chunks
  const similarities: SimilarityResult[] = [];

  for (const chunk of chunks) {
    try {
      const similarity = cosineSimilarity(queryVector, chunk.embedding.values);
      
      // Only include results above the minimum threshold
      if (similarity >= minSimilarity) {
        similarities.push({
          chunk,
          similarity_score: similarity,
          rank: 0 // Will be set after sorting
        });
      }
    } catch (error) {
      // Log error but continue processing other chunks
      console.error(`Error calculating similarity for chunk ${chunk.id}:`, error);
    }
  }

  // Sort by similarity score in descending order
  similarities.sort((a, b) => b.similarity_score - a.similarity_score);

  // Limit to topK results and set ranks
  const topResults = similarities.slice(0, topK);
  for (let i = 0; i < topResults.length; i++) {
    topResults[i].rank = i + 1;
  }

  return topResults;
}

/**
 * Batch calculate similarities between a query vector and multiple vectors
 * 
 * @param queryVector The query vector
 * @param vectors Array of vectors to compare against
 * @returns Array of similarity scores
 */
export function batchCosineSimilarity(
  queryVector: number[],
  vectors: number[][]
): number[] {
  if (!queryVector || queryVector.length === 0) {
    throw new Error('Query vector cannot be empty');
  }

  if (!vectors || vectors.length === 0) {
    return [];
  }

  return vectors.map(vector => {
    try {
      return cosineSimilarity(queryVector, vector);
    } catch (error) {
      console.error('Error calculating similarity:', error);
      return 0;
    }
  });
}

// ============================================================================
// VECTOR VALIDATION AND UTILITIES
// ============================================================================

/**
 * Validate that a vector has the expected structure
 * 
 * @param vector Vector to validate
 * @param expectedDimensions Expected number of dimensions (optional)
 * @returns True if valid, throws error if invalid
 */
export function validateVector(vector: number[], expectedDimensions?: number): boolean {
  if (!Array.isArray(vector)) {
    throw new Error('Vector must be an array');
  }

  if (vector.length === 0) {
    throw new Error('Vector cannot be empty');
  }

  // Check that all elements are numbers
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || isNaN(vector[i])) {
      throw new Error(`Vector element at index ${i} is not a valid number`);
    }
  }

  // Check dimensions if specified
  if (expectedDimensions !== undefined && vector.length !== expectedDimensions) {
    throw new Error(`Vector has ${vector.length} dimensions, expected ${expectedDimensions}`);
  }

  return true;
}

/**
 * Create a zero vector of specified dimensions
 * 
 * @param dimensions Number of dimensions
 * @returns Zero vector
 */
export function createZeroVector(dimensions: number): number[] {
  if (dimensions <= 0) {
    throw new Error('Dimensions must be greater than 0');
  }

  return new Array(dimensions).fill(0);
}

/**
 * Create a random vector of specified dimensions
 * 
 * @param dimensions Number of dimensions
 * @param min Minimum value for each dimension
 * @param max Maximum value for each dimension
 * @returns Random vector
 */
export function createRandomVector(
  dimensions: number,
  min: number = -1,
  max: number = 1
): number[] {
  if (dimensions <= 0) {
    throw new Error('Dimensions must be greater than 0');
  }

  if (min >= max) {
    throw new Error('Min value must be less than max value');
  }

  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    vector.push(Math.random() * (max - min) + min);
  }

  return vector;
}

/**
 * Calculate the average vector from an array of vectors
 * 
 * @param vectors Array of vectors
 * @returns Average vector
 */
export function averageVectors(vectors: number[][]): number[] {
  if (!vectors || vectors.length === 0) {
    throw new Error('Vectors array cannot be empty');
  }

  const dimensions = vectors[0].length;
  
  // Validate all vectors have the same dimensions
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error('All vectors must have the same dimensions');
    }
  }

  // Calculate average
  const average = createZeroVector(dimensions);
  
  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) {
      average[i] += vector[i];
    }
  }

  // Divide by count to get average
  const count = vectors.length;
  for (let i = 0; i < dimensions; i++) {
    average[i] /= count;
  }

  return average;
}

// ============================================================================
// VECTOR STORAGE AND SERIALIZATION
// ============================================================================

/**
 * Convert vector to a compact string representation
 * 
 * @param vector Vector to serialize
 * @param precision Number of decimal places to keep
 * @returns String representation
 */
export function vectorToString(vector: number[], precision: number = 6): string {
  return vector.map(v => v.toFixed(precision)).join(',');
}

/**
 * Parse vector from string representation
 * 
 * @param vectorString String representation of vector
 * @returns Parsed vector
 */
export function vectorFromString(vectorString: string): number[] {
  if (!vectorString || vectorString.trim() === '') {
    throw new Error('Vector string cannot be empty');
  }

  const parts = vectorString.split(',');
  const vector: number[] = [];

  for (const part of parts) {
    const value = parseFloat(part.trim());
    if (isNaN(value)) {
      throw new Error(`Invalid number in vector string: ${part}`);
    }
    vector.push(value);
  }

  return vector;
}

/**
 * Calculate basic statistics for a vector
 * 
 * @param vector Input vector
 * @returns Statistics object
 */
export function vectorStatistics(vector: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  magnitude: number;
} {
  if (!vector || vector.length === 0) {
    throw new Error('Vector cannot be empty');
  }

  const sorted = [...vector].sort((a, b) => a - b);
  const sum = vector.reduce((acc, val) => acc + val, 0);
  const mean = sum / vector.length;
  
  const median = vector.length % 2 === 0
    ? (sorted[vector.length / 2 - 1] + sorted[vector.length / 2]) / 2
    : sorted[Math.floor(vector.length / 2)];

  const variance = vector.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / vector.length;
  const std = Math.sqrt(variance);

  const magnitude = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0));

  return {
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    std,
    magnitude
  };
}

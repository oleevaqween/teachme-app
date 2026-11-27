// src/lib/information-validator/web-search.ts

/**
 * Web search for claim verification and content enrichment.
 * Uses Tavily Search API — purpose-built for AI grounding with
 * clean, LLM-ready content and verifiable source URLs.
 */

import { tavily } from '@tavily/core';

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  available: boolean;
}

export interface WebSearchOptions {
  /** Maximum number of results to return */
  maxResults?: number;
  /** AbortSignal for timeout/cancellation */
  signal?: AbortSignal;
}

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' });

/**
 * Searches the web for sources corroborating a factual claim.
 * Uses Tavily's search API which returns clean, verified content
 * optimized for AI grounding and citation.
 */
export async function searchWeb(
  query: string,
  options: WebSearchOptions = {}
): Promise<WebSearchResult[]> {
  const { maxResults = 5, signal } = options;

  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  // If no API key configured, return empty (graceful degradation)
  if (!process.env.TAVILY_API_KEY) {
    return [];
  }

  try {
    const response = await tvly.search(query, {
      maxResults,
      searchDepth: 'basic',
      includeAnswer: false,
    });

    return (response.results ?? []).map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.content?.slice(0, 300) ?? '',
      available: true,
    }));
  } catch (error: unknown) {
    // Handle abort
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    // Graceful degradation — return empty on API errors
    console.warn('Tavily search failed:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

/**
 * Searches the web for enrichment content on a topic.
 * Returns more detailed results suitable for curriculum enrichment.
 * Uses Tavily's advanced search depth for richer content.
 */
export async function searchWebForEnrichment(
  query: string,
  options: WebSearchOptions = {}
): Promise<WebSearchResult[]> {
  const { maxResults = 5, signal } = options;

  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  if (!process.env.TAVILY_API_KEY) {
    return [];
  }

  try {
    const response = await tvly.search(query, {
      maxResults,
      searchDepth: 'advanced',
      includeAnswer: false,
    });

    return (response.results ?? []).map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.content?.slice(0, 500) ?? '',
      available: true,
    }));
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    console.warn('Tavily enrichment search failed:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

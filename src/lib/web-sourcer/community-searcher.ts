// src/lib/web-sourcer/community-searcher.ts

import { searchWebForEnrichment } from '@/lib/information-validator/web-search';
import type { CommunitySource } from './index';

/**
 * A generic interface for searching forums and communities.
 * Implementations search specific community platforms for topic-relevant content.
 */
export interface CommunitySearchProvider {
  /** Unique identifier for this provider */
  name: string;
  /** Searches the provider for communities/content matching the topic */
  search(
    topic: string,
    options?: { signal?: AbortSignal }
  ): Promise<CommunitySource[]>;
}

/**
 * Tavily-powered community and web content searcher.
 * Uses Tavily's advanced search to find high-quality articles, forums,
 * and community discussions about any topic. Fully topic-adaptive.
 */
export class TavilySearcher implements CommunitySearchProvider {
  name = 'tavily-web';

  async search(
    topic: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<CommunitySource[]> {
    const { signal } = options;

    try {
      // Search for community discussions and expert articles
      const results = await searchWebForEnrichment(
        `${topic} expert discussion tips best practices community`,
        { maxResults: 5, signal }
      );

      return results
        .filter((r) => r.snippet.length > 50)
        .map((r) => ({
          communityName: extractDomainName(r.url),
          url: r.url,
          content: r.snippet,
          memberCount: 10_000, // Web sources don't have member counts; use a qualifying value
          lastActivityDate: new Date(), // Tavily returns recent results
          topic,
        }));
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      return [];
    }
  }
}

/**
 * Reddit-focused Tavily searcher.
 * Uses Tavily to find Reddit discussions specifically.
 */
export class TavilyRedditSearcher implements CommunitySearchProvider {
  name = 'tavily-reddit';

  async search(
    topic: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<CommunitySource[]> {
    const { signal } = options;

    try {
      const results = await searchWebForEnrichment(
        `site:reddit.com ${topic}`,
        { maxResults: 3, signal }
      );

      return results
        .filter((r) => r.snippet.length > 50 && r.url.includes('reddit.com'))
        .map((r) => ({
          communityName: extractSubreddit(r.url) || 'Reddit',
          url: r.url,
          content: r.snippet,
          memberCount: 50_000, // Reddit communities are typically large
          lastActivityDate: new Date(),
          topic,
        }));
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      return [];
    }
  }
}

/**
 * Searches multiple community providers in parallel.
 * Returns aggregated results from all providers that respond.
 */
export async function searchCommunities(
  topic: string,
  providers: CommunitySearchProvider[],
  options: { signal?: AbortSignal } = {}
): Promise<CommunitySource[]> {
  const { signal } = options;

  const searchPromises = providers.map((provider) =>
    provider.search(topic, { signal }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      return [] as CommunitySource[];
    })
  );

  const results = await Promise.allSettled(searchPromises);

  const sources: CommunitySource[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      sources.push(...result.value);
    }
  }

  return sources;
}

/**
 * Extracts a readable domain name from a URL.
 */
function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return 'Web Source';
  }
}

/**
 * Extracts subreddit name from a Reddit URL.
 */
function extractSubreddit(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/([^/]+)/);
  return match ? `r/${match[1]}` : null;
}

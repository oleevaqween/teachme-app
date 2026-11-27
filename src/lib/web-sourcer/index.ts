// src/lib/web-sourcer/index.ts

import { searchRedditCommunities } from './reddit-searcher';
import {
  searchCommunities,
  TavilySearcher,
  TavilyRedditSearcher,
  type CommunitySearchProvider,
} from './community-searcher';

/**
 * Represents a community source with quality metadata.
 */
export interface CommunitySource {
  communityName: string;
  url: string;
  content: string;
  memberCount: number;
  lastActivityDate: Date;
  topic: string;
}

/**
 * Aggregated result from searching multiple communities.
 */
export interface CommunitySearchResult {
  sources: CommunitySource[];
  searchedCommunities: number;
  failedSearches: number;
  noSourcesAvailable: boolean;
}

/** Quality filter thresholds */
const MIN_MEMBER_COUNT = 1000;
const MAX_INACTIVITY_MONTHS = 12;

/** Default timeout for community search (10 seconds) */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Filters community sources by quality criteria:
 * - Member count must be >= 1000
 * - Last activity must be within the past 12 months
 *
 * This is a pure function suitable for property-based testing.
 */
export function filterByQuality(sources: CommunitySource[]): CommunitySource[] {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - MAX_INACTIVITY_MONTHS);

  return sources.filter((source) => {
    const meetsMinMembers = source.memberCount >= MIN_MEMBER_COUNT;
    const isRecentlyActive = source.lastActivityDate >= twelveMonthsAgo;
    return meetsMinMembers && isRecentlyActive;
  });
}

/**
 * Searches multiple online communities for information related to the topic.
 * Applies quality filtering and returns results within a 30-second timeout.
 *
 * Searches at least 3 community sources in parallel:
 * 1. Reddit (via public JSON API)
 * 2. Stack Exchange
 * 3. DEV Community
 *
 * Gracefully degrades when:
 * - No communities are found matching criteria
 * - Individual searches fail or timeout
 * - All searches timeout
 */
export async function searchInternetSources(
  topic: string,
  options: { timeout?: number; providers?: CommunitySearchProvider[] } = {}
): Promise<CommunitySearchResult> {
  const { timeout = DEFAULT_TIMEOUT_MS, providers } = options;

  // Set up abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const communityProviders = providers ?? [
    new TavilySearcher(),
    new TavilyRedditSearcher(),
  ];

  let searchedCommunities = 0;
  let failedSearches = 0;
  const allSources: CommunitySource[] = [];

  try {
    // Search all sources in parallel
    const [redditResults, communityResults] = await Promise.allSettled([
      searchRedditCommunities(topic, { signal: controller.signal }),
      searchCommunities(topic, communityProviders, {
        signal: controller.signal,
      }),
    ]);

    // Count searched communities (Reddit counts as 1 source, each provider as 1)
    searchedCommunities = 1 + communityProviders.length;

    // Process Reddit results
    if (redditResults.status === 'fulfilled') {
      allSources.push(...redditResults.value);
    } else {
      failedSearches++;
    }

    // Process community results
    if (communityResults.status === 'fulfilled') {
      allSources.push(...communityResults.value);
    } else {
      failedSearches += communityProviders.length;
    }
  } catch (error: unknown) {
    // If the timeout/abort fires, treat all searches as failed
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        sources: [],
        searchedCommunities: 1 + communityProviders.length,
        failedSearches: 1 + communityProviders.length,
        noSourcesAvailable: true,
      };
    }
    // Unexpected error — graceful degradation
    return {
      sources: [],
      searchedCommunities: 0,
      failedSearches: 0,
      noSourcesAvailable: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // Apply quality filter
  const qualitySources = filterByQuality(allSources);

  return {
    sources: qualitySources,
    searchedCommunities,
    failedSearches,
    noSourcesAvailable: qualitySources.length === 0,
  };
}

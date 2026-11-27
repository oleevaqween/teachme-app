import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterByQuality,
  searchInternetSources,
  type CommunitySource,
} from './index';
import type { CommunitySearchProvider } from './community-searcher';

describe('filterByQuality', () => {
  const now = new Date();

  function makeSource(overrides: Partial<CommunitySource> = {}): CommunitySource {
    return {
      communityName: 'TestCommunity',
      url: 'https://example.com',
      content: 'Test content about a topic',
      memberCount: 5000,
      lastActivityDate: now,
      topic: 'testing',
      ...overrides,
    };
  }

  it('includes sources meeting both criteria (members >= 1000, active within 12 months)', () => {
    const sources = [makeSource({ memberCount: 1000 })];
    expect(filterByQuality(sources)).toHaveLength(1);
  });

  it('excludes sources with member count below 1000', () => {
    const sources = [makeSource({ memberCount: 999 })];
    expect(filterByQuality(sources)).toHaveLength(0);
  });

  it('includes sources with exactly 1000 members', () => {
    const sources = [makeSource({ memberCount: 1000 })];
    const result = filterByQuality(sources);
    expect(result).toHaveLength(1);
    expect(result[0].memberCount).toBe(1000);
  });

  it('excludes sources inactive for more than 12 months', () => {
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const sources = [makeSource({ lastActivityDate: thirteenMonthsAgo })];
    expect(filterByQuality(sources)).toHaveLength(0);
  });

  it('includes sources active exactly at the 12-month boundary', () => {
    // Freeze the clock: filterByQuality reads the time again, and a millisecond tick would move the boundary.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 10, 18, 12));
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const sources = [makeSource({ lastActivityDate: twelveMonthsAgo })];
      expect(filterByQuality(sources)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('excludes sources that have enough members but are inactive', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    const sources = [makeSource({ memberCount: 50000, lastActivityDate: oldDate })];
    expect(filterByQuality(sources)).toHaveLength(0);
  });

  it('excludes sources that are active but have too few members', () => {
    const sources = [makeSource({ memberCount: 500, lastActivityDate: now })];
    expect(filterByQuality(sources)).toHaveLength(0);
  });

  it('returns empty array when given empty input', () => {
    expect(filterByQuality([])).toEqual([]);
  });

  it('filters mixed quality sources correctly', () => {
    const sources = [
      makeSource({ communityName: 'Good', memberCount: 5000 }),
      makeSource({ communityName: 'TooFewMembers', memberCount: 100 }),
      makeSource({
        communityName: 'TooOld',
        memberCount: 5000,
        lastActivityDate: new Date('2020-01-01'),
      }),
      makeSource({ communityName: 'AlsoGood', memberCount: 1000 }),
    ];

    const result = filterByQuality(sources);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.communityName)).toEqual(['Good', 'AlsoGood']);
  });
});

describe('searchInternetSources', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeMockProvider(
    name: string,
    result: CommunitySource[] = [],
    delay = 0
  ): CommunitySearchProvider {
    return {
      name,
      search: vi.fn(async (_topic, options) => {
        if (delay > 0) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            options?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }
        return result;
      }),
    };
  }

  it('returns noSourcesAvailable=true when no sources found', async () => {
    // Mock fetch to return empty for Reddit
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { children: [] } }),
      })
    );

    const emptyProvider = makeMockProvider('empty');
    const resultPromise = searchInternetSources('obscure-topic-xyz', {
      providers: [emptyProvider],
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.noSourcesAvailable).toBe(true);
    expect(result.sources).toHaveLength(0);
  });

  it('returns quality-filtered sources from providers', async () => {
    const now = new Date();
    const goodSource: CommunitySource = {
      communityName: 'GoodCommunity',
      url: 'https://example.com',
      content: 'Helpful content',
      memberCount: 5000,
      lastActivityDate: now,
      topic: 'react',
    };

    // Mock fetch for Reddit returning empty
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { children: [] } }),
      })
    );

    const provider = makeMockProvider('test', [goodSource]);
    const resultPromise = searchInternetSources('react', {
      providers: [provider],
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].communityName).toBe('GoodCommunity');
    expect(result.noSourcesAvailable).toBe(false);
  });

  it('gracefully handles timeout by returning empty results', async () => {
    // Create a provider that never resolves
    const slowProvider: CommunitySearchProvider = {
      name: 'slow',
      search: (_topic, options) =>
        new Promise<CommunitySource[]>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    };

    // Mock fetch for Reddit to also hang
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          })
      )
    );

    const resultPromise = searchInternetSources('python', {
      timeout: 100,
      providers: [slowProvider],
    });

    // Advance time past the timeout
    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.noSourcesAvailable).toBe(true);
    expect(result.sources).toHaveLength(0);
  });

  it('reports correct searchedCommunities count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { children: [] } }),
      })
    );

    const providers = [
      makeMockProvider('provider1'),
      makeMockProvider('provider2'),
      makeMockProvider('provider3'),
    ];

    const resultPromise = searchInternetSources('topic', { providers });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    // Reddit (1) + 3 providers = 4
    expect(result.searchedCommunities).toBe(4);
  });

  it('filters out low-quality sources from results', async () => {
    const now = new Date();
    const lowQualitySource: CommunitySource = {
      communityName: 'TinyForum',
      url: 'https://tiny.com',
      content: 'Some content',
      memberCount: 50, // Below 1000 threshold
      lastActivityDate: now,
      topic: 'topic',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { children: [] } }),
      })
    );

    const provider = makeMockProvider('test', [lowQualitySource]);
    const resultPromise = searchInternetSources('topic', {
      providers: [provider],
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.sources).toHaveLength(0);
    expect(result.noSourcesAvailable).toBe(true);
  });
});

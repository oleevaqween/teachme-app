// src/lib/web-sourcer/reddit-searcher.ts

import type { CommunitySource } from './index';

/**
 * Response shape from Reddit's JSON API for subreddit search.
 */
interface RedditSearchResponse {
  data: {
    children: RedditSubredditResult[];
  };
}

interface RedditSubredditResult {
  data: {
    display_name: string;
    url: string;
    subscribers: number;
    public_description: string;
    created_utc: number;
    active_user_count?: number;
    over18: boolean;
    subreddit_type: string;
  };
}

/**
 * Response shape from Reddit's JSON API for post search within a subreddit.
 */
interface RedditPostSearchResponse {
  data: {
    children: RedditPostResult[];
  };
}

interface RedditPostResult {
  data: {
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    created_utc: number;
    subreddit: string;
    score: number;
    num_comments: number;
  };
}

const REDDIT_BASE_URL = 'https://www.reddit.com';

/**
 * Searches Reddit for subreddits matching a topic and retrieves
 * relevant community content. Uses Reddit's public JSON API
 * (appending .json to URLs) — no OAuth required.
 */
export async function searchRedditCommunities(
  topic: string,
  options: { signal?: AbortSignal } = {}
): Promise<CommunitySource[]> {
  const { signal } = options;

  try {
    // Search for relevant subreddits
    const subreddits = await findSubreddits(topic, signal);

    if (subreddits.length === 0) {
      return [];
    }

    // For each qualifying subreddit, fetch top posts related to the topic
    const sourcePromises = subreddits.map((sub) =>
      fetchSubredditContent(sub, topic, signal)
    );

    const results = await Promise.allSettled(sourcePromises);

    const sources: CommunitySource[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        sources.push(result.value);
      }
    }

    return sources;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    // Graceful degradation — return empty on network/parse errors
    return [];
  }
}

/**
 * Finds subreddits matching the given topic using Reddit's search API.
 */
async function findSubreddits(
  topic: string,
  signal?: AbortSignal
): Promise<RedditSubredditResult['data'][]> {
  const searchUrl = `${REDDIT_BASE_URL}/subreddits/search.json?q=${encodeURIComponent(topic)}&limit=10&sort=relevance`;

  const response = await fetch(searchUrl, {
    signal,
    headers: {
      'User-Agent': 'TeachMe-LearningPlatform/1.0',
    },
  });

  if (!response.ok) {
    return [];
  }

  const data: RedditSearchResponse = await response.json();

  // Filter to public, SFW subreddits
  return data.data.children
    .map((child) => child.data)
    .filter(
      (sub) =>
        !sub.over18 && sub.subreddit_type === 'public' && sub.subscribers > 0
    );
}

/**
 * Fetches relevant content from a subreddit and constructs a CommunitySource.
 */
async function fetchSubredditContent(
  subreddit: RedditSubredditResult['data'],
  topic: string,
  signal?: AbortSignal
): Promise<CommunitySource | null> {
  const searchUrl = `${REDDIT_BASE_URL}/r/${subreddit.display_name}/search.json?q=${encodeURIComponent(topic)}&restrict_sr=on&sort=top&t=year&limit=5`;

  const response = await fetch(searchUrl, {
    signal,
    headers: {
      'User-Agent': 'TeachMe-LearningPlatform/1.0',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data: RedditPostSearchResponse = await response.json();
  const posts = data.data.children.map((child) => child.data);

  if (posts.length === 0) {
    return null;
  }

  // Combine top posts into content summary
  const content = posts
    .slice(0, 3)
    .map((post) => {
      const body = post.selftext
        ? post.selftext.substring(0, 500)
        : '';
      return `${post.title}${body ? ': ' + body : ''}`;
    })
    .join('\n\n');

  if (!content.trim()) {
    return null;
  }

  // Determine last activity from most recent post
  const mostRecentPost = posts.reduce((latest, post) =>
    post.created_utc > latest.created_utc ? post : latest
  );

  return {
    communityName: `r/${subreddit.display_name}`,
    url: `${REDDIT_BASE_URL}/r/${subreddit.display_name}`,
    content,
    memberCount: subreddit.subscribers,
    lastActivityDate: new Date(mostRecentPost.created_utc * 1000),
    topic,
  };
}

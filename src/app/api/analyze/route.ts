import { NextResponse } from "next/server";

type CreatorSignal = {
  name: string;
  channelId?: string;
  channelUrl?: string;
  avgViews?: number | null;
  engagementRateAvg10?: number | null;
  engagementRateSample?: number | null;
  sampleVideo?: string;
  videoUrl?: string;
  sampleViews?: number | null;
  sampleVideoIsLatest?: boolean;
};

type BrandProfile = {
  brand: {
    name: string;
    website?: string;
    domain?: string;
    keywords: string[];
  };
  audience: {
    regions: string[];
    languages: string[];
    intents: string[];
  };
  campaign: {
    goal: string;
    formats: string[];
    cta: string;
  };
  contentFit: {
    creatorStyles: string[];
    lengthRange: string;
    productionBar: string;
  };
  safety: {
    exclusions: string[];
    competitorPolicy: string;
  };
  performance: {
    weights: {
      relevance: number;
      engagement: number;
      momentum: number;
      consistency: number;
      safety: number;
    };
    minimums: {
      avgViews: number;
      engagementRate: number;
      uploadsPerMonth: number;
    };
  };
  metadata: {
    generatedAt: string;
    notes: string[];
  };
};

type AnalyzeResponse = {
  profile: BrandProfile;
  creators: CreatorSignal[];
  query: string;
  warning?: string;
  debug?: Record<string, unknown>;
};

const DEFAULTS = {
  searchPath: "/get_general_search",
  searchQueryParam: "search_query",
  keyHeader: "x-api-key",
  keyPrefix: "",
  searchMethod: "GET",
  channelVideosPath: "/get_channel_videos_v3",
  channelIdParam: "channel_id",
  channelVideosLimit: 10,
  videoInfoPath: "/get_video_info_v3",
  videoIdParam: "video_id",
  engagementSample: 10,
};

function normalizeText(value: string | undefined | null) {
  return (value ?? "").trim();
}

function extractDomain(rawUrl?: string) {
  if (!rawUrl) return "";
  try {
    const hasScheme = /^https?:\/\//i.test(rawUrl);
    const url = new URL(hasScheme ? rawUrl : `https://${rawUrl}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function keywordize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values));
}

function buildSearchUrl(baseUrl: string, searchPath: string) {
  if (/^https?:\/\//i.test(searchPath)) {
    return new URL(searchPath);
  }

  const base = new URL(baseUrl);
  const basePath = base.pathname.endsWith("/")
    ? base.pathname.slice(0, -1)
    : base.pathname;
  const extraPath = searchPath.startsWith("/") ? searchPath : `/${searchPath}`;

  base.pathname = `${basePath}${extraPath}` || "/";
  base.search = "";

  return base;
}

function buildChannelUrl(baseUrl: string, path: string) {
  return buildSearchUrl(baseUrl, path);
}

function buildVideoUrl(baseUrl: string, path: string) {
  return buildSearchUrl(baseUrl, path);
}

async function readErrorDetails(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return "";
  }
}

function buildProfile(brandName: string, website?: string): BrandProfile {
  const cleanedName = normalizeText(brandName);
  const domain = extractDomain(website);
  const keywords = uniqueList([
    ...keywordize(cleanedName),
    ...keywordize(domain.replace(/\.[a-z]{2,}$/i, "")),
  ]);

  return {
    brand: {
      name: cleanedName || "Unnamed brand",
      website: normalizeText(website) || undefined,
      domain: domain || undefined,
      keywords,
    },
    audience: {
      regions: ["Global"],
      languages: ["English"],
      intents: ["discovery", "comparison", "purchase"],
    },
    campaign: {
      goal: "consideration",
      formats: ["long-form", "shorts"],
      cta: "site_visit",
    },
    contentFit: {
      creatorStyles: ["authentic", "educational", "opinionated"],
      lengthRange: "30s - 12m",
      productionBar: "mid",
    },
    safety: {
      exclusions: [],
      competitorPolicy: "allow_comparison",
    },
    performance: {
      weights: {
        relevance: 0.3,
        engagement: 0.25,
        momentum: 0.2,
        consistency: 0.15,
        safety: 0.1,
      },
      minimums: {
        avgViews: 5000,
        engagementRate: 0.015,
        uploadsPerMonth: 2,
      },
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      notes: [
        "Auto-generated from brand name or website.",
        "Adjust audience, safety, and performance thresholds after first run.",
      ],
    },
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim().toLowerCase();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;

    const match = cleaned.match(/([0-9]*\.?[0-9]+)\s*([kmb])?/i);
    if (match) {
      const base = Number(match[1]);
      const suffix = (match[2] ?? "").toLowerCase();
      const multiplier =
        suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
      return Number.isFinite(base) ? base * multiplier : null;
    }
  }
  return null;
}

function pickString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickCount(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = toNumber(value);
      if (parsed != null) return parsed;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const runText = Array.isArray(record.runs)
        ? (record.runs[0] as Record<string, unknown> | undefined)?.text
        : undefined;
      const text = pickString(record.simpleText, record.text, runText);
      if (text) {
        const parsed = toNumber(text);
        if (parsed != null) return parsed;
      }
    }
  }
  return null;
}

function extractText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.simpleText === "string") return record.simpleText;
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.runs) && record.runs[0]) {
    const run = record.runs[0] as Record<string, unknown>;
    if (typeof run.text === "string") return run.text;
  }
  return null;
}

function parseViewCount(value: unknown, allowBareNumber = false): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = extractText(value) ?? (typeof value === "string" ? value : null);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (!allowBareNumber && !lower.includes("view")) return null;
  return toNumber(text);
}

function findCountByKeyword(input: unknown, keyword: string) {
  let found: number | null = null;
  const visited = new Set<unknown>();
  const maxDepth = 9;
  let nodes = 0;
  const maxNodes = 4000;

  const walk = (value: unknown, depth: number) => {
    if (found != null || nodes >= maxNodes) return;
    if (!value || typeof value !== "object") {
      if (typeof value === "string") {
        const text = value.toLowerCase();
        if (text.includes(keyword) && /\d/.test(text)) {
          const parsed = toNumber(text);
          if (parsed != null) found = parsed;
        }
      }
      return;
    }

    if (visited.has(value) || depth > maxDepth) return;
    visited.add(value);
    nodes += 1;

    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry, depth + 1);
        if (found != null) return;
      }
      return;
    }

    const record = value as Record<string, unknown>;

    for (const [key, entry] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes(keyword) && lowerKey.includes("count")) {
        const parsed = pickCount(entry);
        if (parsed != null) {
          found = parsed;
          return;
        }
      }
    }

    if (keyword === "like" && record.toggleButtonRenderer) {
      const toggle = record.toggleButtonRenderer as Record<string, unknown>;
      const toggleTexts = [
        toggle.defaultText,
        toggle.toggledText,
        toggle.accessibility,
        toggle.accessibilityData,
      ];
      for (const text of toggleTexts) {
        const parsed = pickCount(text);
        if (parsed != null) {
          found = parsed;
          return;
        }
      }
    }

    if (keyword === "like" && record.segmentedLikeDislikeButtonRenderer) {
      const segmented = record.segmentedLikeDislikeButtonRenderer as Record<
        string,
        unknown
      >;
      const likeButton = segmented.likeButton as Record<string, unknown> | undefined;
      const likeToggle =
        (likeButton?.toggleButtonRenderer as Record<string, unknown>) ??
        (segmented.likeButtonRenderer as Record<string, unknown>) ??
        undefined;
      const parsed = pickCount(
        likeToggle?.defaultText,
        likeToggle?.toggledText,
        likeToggle?.accessibilityData,
        likeToggle?.accessibility
      );
      if (parsed != null) {
        found = parsed;
        return;
      }
    }

    if (keyword === "like" && record.likeButtonRenderer) {
      const likeButton = record.likeButtonRenderer as Record<string, unknown>;
      const parsed = pickCount(
        likeButton.defaultText,
        likeButton.toggledText,
        likeButton.accessibilityData,
        likeButton.accessibility
      );
      if (parsed != null) {
        found = parsed;
        return;
      }
    }

    if (keyword === "comment" && record.commentsHeaderRenderer) {
      const header = record.commentsHeaderRenderer as Record<string, unknown>;
      const parsed = pickCount(header.countText, header.commentsCount);
      if (parsed != null) {
        found = parsed;
        return;
      }
    }

    const textCandidates = [
      record.simpleText,
      record.text,
      record.label,
      record.accessibilityLabel,
      (record.accessibilityData as Record<string, unknown>)?.label,
      (record.accessibility as Record<string, unknown>)?.label,
      (record.title as Record<string, unknown>)?.simpleText,
    ];

    for (const candidate of textCandidates) {
      if (typeof candidate === "string") {
        const text = candidate.toLowerCase();
        if (text.includes(keyword) && /\d/.test(text)) {
          const parsed = toNumber(text);
          if (parsed != null) {
            found = parsed;
            return;
          }
        }
      }
    }

    for (const entry of Object.values(record)) {
      walk(entry, depth + 1);
      if (found != null) return;
    }
  };

  walk(input, 0);
  return found;
}

type CandidateArray = {
  path: string;
  length: number;
  score: number;
  sampleKeys: string[];
};

type RendererCollection = {
  items: unknown[];
  sampleKeys: string[];
};

type RendererCounts = {
  videoRenderer: number;
  reelItemRenderer: number;
  channelRenderer: number;
  itemSectionRenderer: number;
  richItemRenderer: number;
};

type VideoSummary = {
  id: string;
  title?: string;
  views?: number | null;
};

function scoreItem(item: unknown) {
  if (!item || typeof item !== "object") return 0;
  const record = item as Record<string, unknown>;
  const keys = [
    "video_id",
    "videoId",
    "id",
    "title",
    "view_count",
    "views",
    "channel_id",
    "channelId",
    "channel_name",
    "channelTitle",
  ];
  return keys.reduce((score, key) => score + (key in record ? 1 : 0), 0);
}

function scoreArray(arr: unknown[]) {
  const slice = arr.slice(0, 20);
  const total = slice.reduce((sum, item) => sum + scoreItem(item), 0);
  return total / Math.max(slice.length, 1);
}

function countRenderers(payload: unknown): RendererCounts {
  const counts: RendererCounts = {
    videoRenderer: 0,
    reelItemRenderer: 0,
    channelRenderer: 0,
    itemSectionRenderer: 0,
    richItemRenderer: 0,
  };
  const visited = new Set<unknown>();
  const maxDepth = 8;

  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    const record = value as Record<string, unknown>;
    if (record.videoRenderer) counts.videoRenderer += 1;
    if (record.reelItemRenderer) counts.reelItemRenderer += 1;
    if (record.channelRenderer) counts.channelRenderer += 1;
    if (record.itemSectionRenderer) counts.itemSectionRenderer += 1;
    if (record.richItemRenderer) counts.richItemRenderer += 1;

    if (depth >= maxDepth) return;

    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, depth + 1);
      return;
    }

    for (const entry of Object.values(record)) {
      walk(entry, depth + 1);
    }
  };

  walk(payload, 0);
  return counts;
}

function stringifyLimited(value: unknown, maxDepth = 3, maxArray = 6) {
  const seen = new Set<unknown>();
  const helper = (input: unknown, depth: number): unknown => {
    if (depth > maxDepth) return "[MaxDepth]";
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    seen.add(input);

    if (Array.isArray(input)) {
      return input.slice(0, maxArray).map((item) => helper(item, depth + 1));
    }

    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = helper(value, depth + 1);
    }
    return output;
  };

  try {
    return JSON.stringify(helper(value, 0)).slice(0, 1600);
  } catch {
    return "";
  }
}

function collectRendererItems(payload: unknown): RendererCollection {
  const items: unknown[] = [];
  const visited = new Set<unknown>();
  const maxDepth = 7;
  const maxItems = 250;

  const pushRenderer = (renderer: unknown) => {
    if (items.length >= maxItems) return;
    if (renderer && typeof renderer === "object") {
      items.push(renderer);
    }
  };

  const pushFromNode = (node: Record<string, unknown>) => {
    if (node.videoRenderer) pushRenderer(node.videoRenderer);
    if (node.reelItemRenderer) pushRenderer(node.reelItemRenderer);
    if (node.channelRenderer) pushRenderer(node.channelRenderer);

    if (node.richItemRenderer && typeof node.richItemRenderer === "object") {
      const rich = node.richItemRenderer as Record<string, unknown>;
      const content = rich.content as Record<string, unknown> | undefined;
      if (content?.videoRenderer) pushRenderer(content.videoRenderer);
      if (content?.reelItemRenderer) pushRenderer(content.reelItemRenderer);
      if (content?.channelRenderer) pushRenderer(content.channelRenderer);
    }

    if (node.itemSectionRenderer && typeof node.itemSectionRenderer === "object") {
      const section = node.itemSectionRenderer as Record<string, unknown>;
      const contents = section.contents;
      if (Array.isArray(contents)) {
        for (const entry of contents) {
          if (entry && typeof entry === "object") {
            pushFromNode(entry as Record<string, unknown>);
          }
        }
      }
    }
  };

  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    const record = value as Record<string, unknown>;
    pushFromNode(record);

    if (depth >= maxDepth || items.length >= maxItems) return;

    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry, depth + 1);
        if (items.length >= maxItems) return;
      }
      return;
    }

    for (const entry of Object.values(record)) {
      walk(entry, depth + 1);
      if (items.length >= maxItems) return;
    }
  };

  walk(payload, 0);

  return {
    items,
    sampleKeys:
      items[0] && typeof items[0] === "object"
        ? Object.keys(items[0] as Record<string, unknown>)
        : [],
  };
}

function collectItemsAndCandidates(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { items: [], candidates: [] as CandidateArray[] };
  }

  if (Array.isArray(payload)) {
    return { items: payload, candidates: [] as CandidateArray[] };
  }

  const rendererCollection = collectRendererItems(payload);

  if (rendererCollection.items.length) {
    return {
      items: rendererCollection.items,
      candidates: [
        {
          path: "renderer:videoRenderer/reelItemRenderer/channelRenderer",
          length: rendererCollection.items.length,
          score: scoreArray(rendererCollection.items),
          sampleKeys: rendererCollection.sampleKeys,
        },
      ],
    };
  }

  const arrays: { items: unknown[]; path: string }[] = [];

  const pushIfArray = (value: unknown, path: string) => {
    if (Array.isArray(value)) arrays.push({ items: value, path });
  };

  const scanKnown = (record: Record<string, unknown>, basePath: string) => {
    pushIfArray(record.videos, `${basePath}.videos`);
    pushIfArray(record.items, `${basePath}.items`);
    pushIfArray(record.results, `${basePath}.results`);
    pushIfArray(record.contents, `${basePath}.contents`);
    pushIfArray(record.search_result, `${basePath}.search_result`);
    pushIfArray(record.searchResult, `${basePath}.searchResult`);
    pushIfArray(record.video_list, `${basePath}.video_list`);
    pushIfArray(record.videoList, `${basePath}.videoList`);
    pushIfArray(record.shorts, `${basePath}.shorts`);
    pushIfArray(record.channels, `${basePath}.channels`);
    pushIfArray(record.data, `${basePath}.data`);

    if (record.data && typeof record.data === "object") {
      scanKnown(record.data as Record<string, unknown>, `${basePath}.data`);
    }
  };

  scanKnown(payload as Record<string, unknown>, "payload");

  const visited = new Set<unknown>();
  const maxDepth = 5;

  const walk = (value: unknown, depth: number, path: string) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === "object") {
        arrays.push({ items: value, path });
      }
      if (depth >= maxDepth) return;
      value.forEach((item, index) => walk(item, depth + 1, `${path}[${index}]`));
      return;
    }

    if (depth >= maxDepth) return;
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>
    )) {
      walk(entry, depth + 1, `${path}.${key}`);
    }
  };

  walk(payload, 0, "payload");

  const candidates = arrays.map(({ items, path }) => ({
    path,
    length: items.length,
    score: scoreArray(items),
    sampleKeys:
      items[0] && typeof items[0] === "object"
        ? Object.keys(items[0] as Record<string, unknown>)
        : [],
  }));

  const best = candidates.reduce<{
    path: string;
    items: unknown[];
    score: number;
  } | null>((acc, candidate, index) => {
    if (candidate.length === 0) return acc;
    const currentScore = candidate.score;
    if (!acc || currentScore > acc.score) {
      return { path: candidate.path, items: arrays[index].items, score: currentScore };
    }
    return acc;
  }, null);

  return {
    items: best?.items ?? [],
    candidates: candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 6),
  };
}

function extractCreatorSignals(items: unknown[]): CreatorSignal[] {
  const creators = new Map<
    string,
    CreatorSignal & { totalViews: number; viewCount: number }
  >();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const record =
      (raw.videoRenderer as Record<string, unknown>) ??
      (raw.reelItemRenderer as Record<string, unknown>) ??
      (raw.channelRenderer as Record<string, unknown>) ??
      raw;

    const ownerText = record.ownerText as Record<string, unknown> | undefined;
    const longBylineText = record.longBylineText as Record<string, unknown> | undefined;
    const shortBylineText = record.shortBylineText as Record<string, unknown> | undefined;

    const channelRun =
      ownerText?.runs?.[0] ?? longBylineText?.runs?.[0] ?? shortBylineText?.runs?.[0] ?? null;

    const channelName = pickString(
      record.channel_name,
      record.channelTitle,
      record.channel,
      record.author,
      record.ownerChannelName,
      record.uploader,
      typeof channelRun === "object"
        ? (channelRun as Record<string, unknown>)?.text
        : undefined
    );

    const channelEndpoint =
      typeof channelRun === "object"
        ? ((channelRun as Record<string, unknown>)?.navigationEndpoint as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const browseEndpoint = channelEndpoint?.browseEndpoint as
      | Record<string, unknown>
      | undefined;

    const channelId = pickString(
      record.channel_id,
      record.channelId,
      record.authorId,
      record.ownerChannelId,
      typeof channelRun === "object"
        ? (browseEndpoint?.browseId as string | undefined)
        : undefined
    );

    const canonicalBase = browseEndpoint?.canonicalBaseUrl as string | undefined;

    const channelUrl = pickString(
      record.channel_url,
      record.channelUrl,
      record.authorUrl,
      canonicalBase ? `https://www.youtube.com${canonicalBase}` : undefined
    );

    const titleObject = record.title as Record<string, unknown> | undefined;
    const headlineObject = record.headline as Record<string, unknown> | undefined;

    const titleRun = titleObject?.runs?.[0] ?? headlineObject?.runs?.[0] ?? null;

    const title = pickString(
      record.title,
      record.video_title,
      record.name,
      typeof titleRun === "object"
        ? (titleRun as Record<string, unknown>)?.text
        : undefined,
      titleObject?.simpleText as string | undefined
    );
    const videoId = pickString(record.video_id, record.videoId, record.id);
    const viewText = pickString(
      record.view_count,
      record.views,
      record.viewCount,
      (record.viewCountText as Record<string, unknown>)?.simpleText as
        | string
        | undefined,
      (record.viewCountText as Record<string, unknown>)?.runs?.[0]?.text as
        | string
        | undefined,
      (record.shortViewCountText as Record<string, unknown>)?.simpleText as
        | string
        | undefined,
      (record.shortViewCountText as Record<string, unknown>)?.runs?.[0]?.text as
        | string
        | undefined
    );
    const views = toNumber(viewText);

    if (!channelName && !channelId) continue;
    const key = channelId || channelName || "unknown";

    const existing = creators.get(key);
    const totalViews =
      (existing?.totalViews ?? 0) + (views != null ? views : 0);
    const viewCount = (existing?.viewCount ?? 0) + (views != null ? 1 : 0);

    const sampleViews = existing?.sampleViews ?? views ?? null;
    const sampleVideo = existing?.sampleVideo ?? title;
    const sampleVideoUrl =
      existing?.videoUrl ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined);

    creators.set(key, {
      name: existing?.name ?? channelName ?? channelId ?? "Unknown",
      channelId: existing?.channelId ?? channelId,
      channelUrl: existing?.channelUrl ?? channelUrl,
      avgViews: viewCount > 0 ? totalViews / viewCount : null,
      sampleVideo,
      sampleViews,
      videoUrl: sampleVideoUrl,
      totalViews,
      viewCount,
    });
  }

  return Array.from(creators.values())
    .sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0))
    .slice(0, 12);
}

function extractViewCounts(items: unknown[], limit: number) {
  const counts: number[] = [];
  for (const item of items) {
    if (counts.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    const views =
      parseViewCount(record.view_count, true) ??
      parseViewCount(record.views, true) ??
      parseViewCount(record.viewCount, true) ??
      parseViewCount(record.viewCountText as Record<string, unknown> | undefined) ??
      parseViewCount(
        record.shortViewCountText as Record<string, unknown> | undefined
      );
    if (views != null) counts.push(views);
  }
  return counts;
}

function extractChannelVideoSummaries(items: unknown[], limit: number) {
  const summaries: VideoSummary[] = [];

  for (const item of items) {
    if (summaries.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const record =
      (raw.videoRenderer as Record<string, unknown>) ??
      (raw.reelItemRenderer as Record<string, unknown>) ??
      raw;

    const videoId = pickString(
      record.video_id,
      record.videoId,
      record.id,
      (record.videoRenderer as Record<string, unknown>)?.videoId as
        | string
        | undefined
    );
    if (!videoId) continue;

    const titleObject = record.title as Record<string, unknown> | undefined;
    const titleRun = titleObject?.runs?.[0] as Record<string, unknown> | undefined;
    const title = pickString(
      record.title,
      record.name,
      titleObject?.simpleText as string | undefined,
      titleRun?.text as string | undefined
    );

    const views =
      parseViewCount(record.view_count, true) ??
      parseViewCount(record.views, true) ??
      parseViewCount(record.viewCount, true) ??
      parseViewCount(record.viewCountText as Record<string, unknown> | undefined) ??
      parseViewCount(
        record.shortViewCountText as Record<string, unknown> | undefined
      );

    if (!summaries.find((entry) => entry.id === videoId)) {
      summaries.push({ id: videoId, title, views });
    }
  }

  return summaries;
}

function extractEngagementRates(items: unknown[], limit: number) {
  const rates: number[] = [];
  for (const item of items) {
    if (rates.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    const views =
      parseViewCount(record.view_count, true) ??
      parseViewCount(record.views, true) ??
      parseViewCount(record.viewCount, true) ??
      parseViewCount(record.viewCountText as Record<string, unknown> | undefined) ??
      parseViewCount(
        record.shortViewCountText as Record<string, unknown> | undefined
      );

    if (!views || views <= 0) continue;

    const likes = pickCount(
      record.like_count,
      record.likes,
      record.likeCount,
      record.likeCountText as Record<string, unknown> | undefined,
      record.likeCountText?.simpleText as string | undefined,
      record.likeCountText?.runs?.[0]?.text as string | undefined
    );

    const comments = pickCount(
      record.comment_count,
      record.comments,
      record.commentCount,
      record.commentCountText as Record<string, unknown> | undefined,
      record.commentCountText?.simpleText as string | undefined,
      record.commentCountText?.runs?.[0]?.text as string | undefined
    );

    if (likes == null && comments == null) continue;

    const totalEngagement = (likes ?? 0) + (comments ?? 0);
    if (totalEngagement <= views) {
      rates.push(totalEngagement / views);
    }
  }

  return rates;
}

function extractVideoIds(items: unknown[], limit: number) {
  const ids: string[] = [];
  for (const item of items) {
    if (ids.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = pickString(
      record.video_id,
      record.videoId,
      record.id,
      (record.videoRenderer as Record<string, unknown>)?.videoId as
        | string
        | undefined
    );
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function extractVideoStats(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data as Record<string, unknown>) ?? {};
  const playerResponse = data.playerResponse as Record<string, unknown> | undefined;
  const initialData = data.initialData as Record<string, unknown> | undefined;
  const candidates: Array<Record<string, unknown> | undefined> = [
    root,
    data,
    playerResponse,
    playerResponse?.videoDetails as Record<string, unknown> | undefined,
    data.video as Record<string, unknown> | undefined,
    data.videoDetails as Record<string, unknown> | undefined,
    root.videoDetails as Record<string, unknown> | undefined,
  ];

  const pickFrom = (record?: Record<string, unknown>) => {
    if (!record) return { views: null, likes: null, comments: null };
    const stats = record.statistics as Record<string, unknown> | undefined;
    const views = pickCount(
      record.view_count,
      record.views,
      record.viewCount,
      parseViewCount(record.viewCountText as Record<string, unknown> | undefined),
      parseViewCount(
        record.shortViewCountText as Record<string, unknown> | undefined
      ),
      stats?.viewCount,
      stats?.view_count,
      (record.videoDetails as Record<string, unknown>)?.viewCount
    );
    const likes = pickCount(
      record.like_count,
      record.likes,
      record.likeCount,
      record.likeCountText as Record<string, unknown> | undefined,
      stats?.likeCount,
      stats?.like_count
    );
    const comments = pickCount(
      record.comment_count,
      record.comments,
      record.commentCount,
      record.commentCountText as Record<string, unknown> | undefined,
      stats?.commentCount,
      stats?.comment_count
    );
    return { views, likes, comments };
  };

  for (const candidate of candidates) {
    const stats = pickFrom(candidate);
    if (stats.views != null || stats.likes != null || stats.comments != null) {
      const likes =
        stats.likes ?? (initialData ? findCountByKeyword(initialData, "like") : null);
      const comments =
        stats.comments ??
        (initialData ? findCountByKeyword(initialData, "comment") : null);
      const views =
        stats.views ?? (initialData ? findCountByKeyword(initialData, "view") : null);
      return { views, likes, comments };
    }
  }

  if (initialData) {
    const likes = findCountByKeyword(initialData, "like");
    const comments = findCountByKeyword(initialData, "comment");
    const viewsFromInitial = findCountByKeyword(initialData, "view");
    const views = playerResponse
      ? pickFrom(playerResponse).views ?? viewsFromInitial
      : pickFrom(data).views;
    if (views != null || likes != null || comments != null) {
      return { views, likes, comments };
    }
  }

  return null;
}

async function fetchVideoEngagementRates(params: {
  baseUrl: string;
  apiKey: string;
  keyHeader: string;
  keyPrefix: string;
  videoInfoPath: string;
  videoIdParam: string;
  videoIds: string[];
  debug?: boolean;
  viewLookup?: Record<string, number | null>;
}) {
  const {
    baseUrl,
    apiKey,
    keyHeader,
    keyPrefix,
    videoInfoPath,
    videoIdParam,
    videoIds,
    debug,
    viewLookup,
  } = params;

  const normalizedPrefix =
    keyPrefix && !keyPrefix.endsWith(" ") ? `${keyPrefix} ` : keyPrefix;

  const rates = new Map<string, number>();
  const debugSamples: Array<Record<string, unknown>> = [];

  await Promise.all(
    videoIds.map(async (videoId) => {
      const url = buildVideoUrl(baseUrl, videoInfoPath);
      url.searchParams.set(videoIdParam, videoId);
      url.searchParams.set("need_format", "true");

      const response = await fetch(url, {
        headers: {
          [keyHeader]: `${normalizedPrefix}${apiKey}`,
        },
        cache: "no-store",
      });

      if (!response.ok) return;

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const stats = extractVideoStats(payload);
      if (debug && debugSamples.length < 2) {
        const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        const data = (root.data as Record<string, unknown>) ?? {};
        const videoDetails =
          (data.videoDetails as Record<string, unknown>) ??
          (data.video as Record<string, unknown>) ??
          (root.videoDetails as Record<string, unknown>) ??
          {};
        const playerResponse =
          (data.playerResponse as Record<string, unknown>) ?? {};
        const initialData =
          (data.initialData as Record<string, unknown>) ?? {};
        const statistics =
          (videoDetails.statistics as Record<string, unknown>) ??
          (data.statistics as Record<string, unknown>) ??
          {};
        const initialLikes = initialData ? findCountByKeyword(initialData, "like") : null;
        const initialComments = initialData ? findCountByKeyword(initialData, "comment") : null;
        debugSamples.push({
          videoId,
          rootKeys: Object.keys(root),
          dataKeys: Object.keys(data),
          playerResponseKeys: Object.keys(playerResponse),
          initialDataKeys: Object.keys(initialData),
          initialDataSample: stringifyLimited(initialData, 2, 4),
          videoDetailsKeys: Object.keys(videoDetails),
          statisticsKeys: Object.keys(statistics),
          initialCounts: { likes: initialLikes, comments: initialComments },
          extracted: stats,
        });
      }
      const views = stats?.views ?? viewLookup?.[videoId] ?? null;
      if (!views || views <= 0) return;
      const totalEngagement = (stats?.likes ?? 0) + (stats?.comments ?? 0);
      if (totalEngagement <= 0) return;
      if (totalEngagement > views) return;
      rates.set(videoId, totalEngagement / views);
    })
  );

  return { rates, debugSamples };
}

async function fetchChannelStats(params: {
  baseUrl: string;
  apiKey: string;
  keyHeader: string;
  keyPrefix: string;
  channelVideosPath: string;
  channelIdParam: string;
  channelId: string;
  limit: number;
  videoInfoPath: string;
  videoIdParam: string;
  engagementSample: number;
  debug?: boolean;
}) {
  const {
    baseUrl,
    apiKey,
    keyHeader,
    keyPrefix,
    channelVideosPath,
    channelIdParam,
    channelId,
    limit,
    videoInfoPath,
    videoIdParam,
    engagementSample,
    debug,
  } = params;

  const normalizedPrefix =
    keyPrefix && !keyPrefix.endsWith(" ") ? `${keyPrefix} ` : keyPrefix;

  const url = buildChannelUrl(baseUrl, channelVideosPath);
  url.searchParams.set(channelIdParam, channelId);
  url.searchParams.set("need_format", "true");

  const response = await fetch(url, {
    headers: {
      [keyHeader]: `${normalizedPrefix}${apiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const { items } = collectItemsAndCandidates(payload);
  const summaries = extractChannelVideoSummaries(items, limit);
  const viewCounts = summaries
    .map((summary) => summary.views)
    .filter((value): value is number => typeof value === "number");
  const videoIds = summaries.map((summary) => summary.id).slice(0, engagementSample);
  const viewLookup = summaries.reduce<Record<string, number | null>>(
    (acc, summary) => {
      acc[summary.id] = summary.views ?? null;
      return acc;
    },
    {}
  );

  if (!viewCounts.length && !summaries.length) return null;
  const total = viewCounts.reduce((sum, value) => sum + value, 0);
  const avgViews = viewCounts.length ? total / viewCounts.length : null;

  let avgEngagement: number | null = null;
  let sampleEngagement: number | null = null;
  const sample = summaries[0];

  if (videoIds.length) {
    const { rates, debugSamples } = await fetchVideoEngagementRates({
      baseUrl,
      apiKey,
      keyHeader,
      keyPrefix,
      videoInfoPath,
      videoIdParam,
      videoIds,
      viewLookup,
      debug,
    });

    if (rates.size) {
      const values = Array.from(rates.values());
      avgEngagement = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (sample && rates.has(sample.id)) {
        sampleEngagement = rates.get(sample.id) ?? null;
      }
    }

    if (debug && debugSamples.length) {
      return {
        avgViews,
        engagementRateAvg10: avgEngagement,
        engagementRateSample: sampleEngagement,
        sampleVideoId: sample?.id,
        sampleVideoTitle: sample?.title,
        sampleVideoViews: sample?.views ?? null,
        debugSamples,
      };
    }
  }

  return {
    avgViews,
    engagementRateAvg10: avgEngagement,
    engagementRateSample: sampleEngagement,
    sampleVideoId: sample?.id,
    sampleVideoTitle: sample?.title,
    sampleVideoViews: sample?.views ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      brandName?: string;
      website?: string;
    };

    const brandName = normalizeText(body.brandName);
    const website = normalizeText(body.website);
    const profile = buildProfile(brandName, website);

    const baseUrl = process.env.TIKHUB_API_BASE_URL;
    const apiKey = process.env.TIKHUB_API_KEY;

    const query = [brandName, profile.brand.domain].filter(Boolean).join(" ");

    if (!baseUrl || !apiKey) {
      const warning = "Missing TIKHUB_API_BASE_URL or TIKHUB_API_KEY.";
      return NextResponse.json<AnalyzeResponse>({
        profile,
        creators: [],
        query,
        warning,
      });
    }

    const searchPath = process.env.TIKHUB_SEARCH_PATH ?? DEFAULTS.searchPath;
    const searchQueryParam =
      process.env.TIKHUB_SEARCH_QUERY_PARAM ?? DEFAULTS.searchQueryParam;
    const keyHeader = process.env.TIKHUB_API_KEY_HEADER ?? DEFAULTS.keyHeader;
    const keyPrefix = process.env.TIKHUB_API_KEY_PREFIX ?? DEFAULTS.keyPrefix;
    const searchMethod =
      (process.env.TIKHUB_SEARCH_METHOD ?? DEFAULTS.searchMethod).toUpperCase();
    const channelVideosPath =
      process.env.TIKHUB_CHANNEL_VIDEOS_PATH ?? DEFAULTS.channelVideosPath;
    const channelIdParam =
      process.env.TIKHUB_CHANNEL_ID_PARAM ?? DEFAULTS.channelIdParam;
    const channelVideosLimitRaw =
      process.env.TIKHUB_CHANNEL_VIDEOS_LIMIT ??
      DEFAULTS.channelVideosLimit.toString();
    const channelVideosLimit = Number(channelVideosLimitRaw) || DEFAULTS.channelVideosLimit;
    const videoInfoPath =
      process.env.TIKHUB_VIDEO_INFO_PATH ?? DEFAULTS.videoInfoPath;
    const videoIdParam = process.env.TIKHUB_VIDEO_ID_PARAM ?? DEFAULTS.videoIdParam;
    const engagementSampleRaw =
      process.env.TIKHUB_ENGAGEMENT_SAMPLE ??
      channelVideosLimit.toString();
    const engagementSample = Number(engagementSampleRaw) || channelVideosLimit;
    const normalizedPrefix =
      keyPrefix && !keyPrefix.endsWith(" ") ? `${keyPrefix} ` : keyPrefix;

    const url = buildSearchUrl(baseUrl, searchPath);
    const queryValue = query || brandName || website || "";

    if (searchMethod !== "POST") {
      url.searchParams.set(searchQueryParam, queryValue);
      url.searchParams.set("need_format", "true");
    }

    const response = await fetch(url, {
      method: searchMethod,
      headers: {
        [keyHeader]: `${normalizedPrefix}${apiKey}`,
        ...(searchMethod === "POST"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        searchMethod === "POST"
          ? JSON.stringify({
              [searchQueryParam]: queryValue,
              need_format: true,
            })
          : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await readErrorDetails(response);
      const debug = `Request: ${searchMethod} ${url.toString()}`;
      const warning = `Tikhub API error: ${response.status} ${response.statusText}${
        details ? ` | ${details}` : ""
      } | ${debug}`;
      return NextResponse.json<AnalyzeResponse>({
        profile,
        creators: [],
        query,
        warning,
      });
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const { items, candidates } = collectItemsAndCandidates(payload);
    const creators = extractCreatorSignals(items);

    const enrichedCreators: CreatorSignal[] = [];
    let engagementDebug: Record<string, unknown> | null = null;
    for (const creator of creators) {
      if (!creator.channelId) {
        enrichedCreators.push(creator);
        continue;
      }

      const stats = await fetchChannelStats({
        baseUrl,
        apiKey,
        keyHeader,
        keyPrefix,
        channelVideosPath,
        channelIdParam,
        channelId: creator.channelId,
        limit: channelVideosLimit,
        videoInfoPath,
        videoIdParam,
        engagementSample,
        debug: engagementDebug == null,
      });

      if (engagementDebug == null && stats?.debugSamples?.length) {
        engagementDebug = {
          channelId: creator.channelId,
          sampleVideoId: stats.sampleVideoId,
          debugSamples: stats.debugSamples,
        };
      }

      enrichedCreators.push({
        ...creator,
        avgViews: stats?.avgViews ?? creator.avgViews ?? null,
        engagementRateAvg10:
          stats?.engagementRateAvg10 ?? creator.engagementRateAvg10 ?? null,
        engagementRateSample:
          stats?.engagementRateSample ?? creator.engagementRateSample ?? null,
        sampleVideo: stats?.sampleVideoTitle ?? creator.sampleVideo,
        sampleViews: stats?.sampleVideoViews ?? creator.sampleViews ?? null,
        videoUrl: stats?.sampleVideoId
          ? `https://www.youtube.com/watch?v=${stats.sampleVideoId}`
          : creator.videoUrl,
        sampleVideoIsLatest: stats?.sampleVideoId ? true : creator.sampleVideoIsLatest,
      });
    }

    const debug =
      enrichedCreators.length === 0
        ? {
            payloadKeys:
              payload && typeof payload === "object"
                ? Object.keys(payload as Record<string, unknown>)
                : [],
            itemsFound: items.length,
            itemKeys:
              items[0] && typeof items[0] === "object"
                ? Object.keys(items[0] as Record<string, unknown>)
                : [],
            itemSample: items[0]
              ? JSON.stringify(items[0]).slice(0, 1200)
              : "",
            candidates,
            dataKeys:
              payload && typeof payload === "object"
                ? Object.keys(
                    ((payload as Record<string, unknown>).data as Record<
                      string,
                      unknown
                    >) ?? {}
                  )
                : [],
            rendererCounts: countRenderers(payload),
            dataSample:
              payload && typeof payload === "object"
                ? stringifyLimited((payload as Record<string, unknown>).data)
                : "",
          }
        : undefined;

    return NextResponse.json<AnalyzeResponse>({
      profile,
      creators: enrichedCreators,
      query,
      ...(debug ? { debug } : {}),
      ...(engagementDebug ? { engagementDebug } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json(
      {
        error: message,
        warning: message,
      },
      { status: 500 }
    );
  }
}

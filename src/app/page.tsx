"use client";

import { useMemo, useState } from "react";

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

type AnalyzeResponse = {
  profile: Record<string, unknown>;
  creators: CreatorSignal[];
  query: string;
  warning?: string;
  debug?: {
    payloadKeys: string[];
    itemsFound: number;
    itemKeys: string[];
    itemSample: string;
    candidates?: Array<{
      path: string;
      length: number;
      score: number;
      sampleKeys: string[];
    }>;
    dataKeys?: string[];
    rendererCounts?: {
      videoRenderer: number;
      reelItemRenderer: number;
      channelRenderer: number;
      itemSectionRenderer: number;
      richItemRenderer: number;
    };
    dataSample?: string;
  };
};

export default function Home() {
  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const profileJson = useMemo(() => {
    if (!result?.profile) return "";
    return JSON.stringify(result.profile, null, 2);
  }, [result]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsLoading(true);

    if (!brandName.trim() && !website.trim()) {
      setError("Add a brand name or website to start.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/creator-signal/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, website }),
      });

      const payload = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(
          payload?.warning || (payload as { error?: string })?.error || "Unable to analyze brand."
        );
      }

      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-10 h-80 w-80 rounded-full bg-[#ff7a59]/30 blur-[120px]" />
        <div className="absolute right-10 top-0 h-72 w-72 rounded-full bg-[#3fb6a8]/25 blur-[110px]" />
        <div className="absolute bottom-0 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#f1c27d]/25 blur-[140px]" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
            CS
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Brand Creator Match
            </p>
            <h1 className="font-display text-lg">Creator Signal</h1>
          </div>
        </div>
        <span className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
          Brand to Creator Fit
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-16">
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.25em] text-[var(--ink-muted)]">
              Auto-generated brand profile
            </p>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              Find YouTubers that feel on-brand before you even brief them.
            </h2>
            <p className="max-w-xl text-base leading-7 text-[var(--ink-muted)] sm:text-lg">
              Drop in a brand name or website. We generate a working brand profile,
              then use the Tikhub API to surface creators with relevant signals.
              The profile is auto-approved for V1 so you can move fast.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              {["Discovery", "Fit scoring", "Performance hints"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[var(--border-soft)] bg-white/70 px-4 py-2"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 rounded-3xl border border-[var(--border-soft)] bg-white/90 p-6 shadow-soft"
          >
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Brand Name
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-base outline-none transition focus:border-black"
                placeholder="e.g. Allbirds, Canva, Notion"
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Website (optional)
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3 text-base outline-none transition focus:border-black"
                placeholder="brand.com"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#2b2b2b] disabled:opacity-60"
            >
              {isLoading ? "Analyzing..." : "Find Creators"}
            </button>

            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-white/70 p-4 text-xs text-[var(--ink-muted)]">
              Add your API key in
              <span className="ml-1 rounded bg-black/5 px-2 py-1 font-mono">
                .env.local
              </span>
              :
              <div className="mt-2 font-mono text-[11px]">
                TIKHUB_API_BASE_URL=...
                <br />
                TIKHUB_API_KEY=...
              </div>
            </div>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-[var(--border-soft)] bg-white/80 p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl">Auto-generated profile</h3>
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Approved
              </span>
            </div>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              This JSON is built instantly from the brand name or domain. It is
              intentionally conservative so you can refine later.
            </p>
            <pre className="mt-5 max-h-[360px] overflow-auto rounded-2xl border border-[var(--border-soft)] bg-[#141311] p-4 text-xs text-[#f7efe4]">
              {profileJson || "Run a search to see the generated profile."}
            </pre>
          </div>

          <div className="rounded-3xl border border-[var(--border-soft)] bg-white/80 p-6 shadow-soft">
            <h3 className="font-display text-2xl">Creator short-list</h3>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              Results are pulled from Tikhub search and rolled up by channel.
              Tune the query later if you want broader or narrower creators.
            </p>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {result?.warning && !error && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {result.warning}
              </div>
            )}

            {!result && !error ? (
              <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-soft)] px-4 py-6 text-sm text-[var(--ink-muted)]">
                No creators yet. Run your first search.
              </div>
            ) : null}

            {result?.debug && !result.creators?.length ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Debug: itemsFound={result.debug.itemsFound}; payloadKeys=[
                {result.debug.payloadKeys.join(", ")}]; itemKeys=[
                {result.debug.itemKeys.join(", ")}]
                {result.debug.itemSample ? (
                  <div className="mt-2 whitespace-pre-wrap break-words text-[11px] text-amber-900/80">
                    {result.debug.itemSample}
                  </div>
                ) : null}
                {result.debug.candidates?.length ? (
                  <div className="mt-3 space-y-1 text-[11px] text-amber-900/80">
                    {result.debug.candidates.map((candidate) => (
                      <div key={candidate.path}>
                        {candidate.path} | len={candidate.length} | score=
                        {candidate.score.toFixed(2)} | keys=[
                        {candidate.sampleKeys.join(", ")}]
                      </div>
                    ))}
                  </div>
                ) : null}
                {result.debug.dataKeys?.length ? (
                  <div className="mt-3 text-[11px] text-amber-900/80">
                    dataKeys=[{result.debug.dataKeys.join(", ")}]
                  </div>
                ) : null}
                {result.debug.rendererCounts ? (
                  <div className="mt-2 text-[11px] text-amber-900/80">
                    rendererCounts: v={result.debug.rendererCounts.videoRenderer}
                    , reel={result.debug.rendererCounts.reelItemRenderer},
                    channel={result.debug.rendererCounts.channelRenderer},
                    itemSection=
                    {result.debug.rendererCounts.itemSectionRenderer},
                    rich={result.debug.rendererCounts.richItemRenderer}
                  </div>
                ) : null}
                {result.debug.dataSample ? (
                  <div className="mt-2 whitespace-pre-wrap break-words text-[11px] text-amber-900/80">
                    {result.debug.dataSample}
                  </div>
                ) : null}
              </div>
            ) : null}

            {result?.creators?.length ? (
              <div className="mt-6 space-y-4">
                {result.creators.map((creator) => (
                  <div
                    key={`${creator.name}-${creator.channelId ?? ""}`}
                    className="rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold">{creator.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                          {creator.channelId || "Channel ID pending"}
                        </p>
                      </div>
                      {creator.channelUrl ? (
                        <a
                          className="text-xs uppercase tracking-[0.2em] text-black underline-offset-4 hover:underline"
                          href={creator.channelUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Channel
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      <span className="rounded-full bg-black/5 px-3 py-1">
                        Avg views (last 10): {creator.avgViews?.toFixed(0) ?? "n/a"}
                      </span>
                      <span className="rounded-full bg-black/5 px-3 py-1">
                        Engagement rate (last 10):{" "}
                        {creator.engagementRateAvg10 != null
                          ? `${(creator.engagementRateAvg10 * 100).toFixed(2)}%`
                          : "n/a"}
                      </span>
                      <span className="rounded-full bg-black/5 px-3 py-1">
                        Engagement rate (sample):{" "}
                        {creator.engagementRateSample != null
                          ? `${(creator.engagementRateSample * 100).toFixed(2)}%`
                          : "n/a"}
                      </span>
                      {creator.sampleViews ? (
                        <span className="rounded-full bg-black/5 px-3 py-1">
                          Sample views: {creator.sampleViews}
                        </span>
                      ) : null}
                    </div>
                    {creator.sampleVideo ? (
                      <div className="mt-3 text-sm text-[var(--ink-muted)]">
                        {creator.sampleVideoIsLatest ? "Latest" : "Sample"}:{" "}
                        {creator.sampleVideo}
                        {creator.videoUrl ? (
                          <a
                            className="ml-2 text-xs uppercase tracking-[0.2em] text-black underline-offset-4 hover:underline"
                            href={creator.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

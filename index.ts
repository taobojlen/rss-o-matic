import homepage from "./index.html";
import { nanoid } from "nanoid";
import { saveFeed, getFeed } from "./src/db";
import { fetchPage } from "./src/fetch-page";
import { trimHtml } from "./src/html-trimmer";
import { generateParserConfig } from "./src/ai";
import { parseHtml } from "./src/parser";
import { generateRssXml } from "./src/rss";
import {
  getCachedFeed,
  setCachedFeed,
  startCacheCleanup,
} from "./src/cache";
import type { ParserConfig, GenerateRequest } from "./src/schema";

startCacheCleanup();

const port = Number(process.env.PORT) || 3000;

Bun.serve({
  port,
  routes: {
    "/": homepage,

    "/api/generate": {
      async POST(req) {
        try {
          const body = (await req.json()) as GenerateRequest;
          if (!body.url || typeof body.url !== "string") {
            return Response.json({ error: "url is required" }, { status: 400 });
          }

          // Validate URL
          try {
            new URL(body.url);
          } catch {
            return Response.json(
              { error: "Invalid URL" },
              { status: 400 }
            );
          }

          // 1. Fetch the page
          const html = await fetchPage(body.url);

          // 2. Trim HTML for AI
          const trimmed = trimHtml(html);

          // 3. Generate parser config via AI
          const config = await generateParserConfig(trimmed, body.url);

          // 4. Validate by running the parser against the actual HTML
          const preview = parseHtml(html, config, body.url);
          if (preview.items.length === 0) {
            return Response.json(
              {
                error:
                  "AI-generated config found no items on the page. Try a different URL.",
              },
              { status: 422 }
            );
          }

          // 5. Save to database
          const feedId = nanoid(12);
          saveFeed(feedId, body.url, preview.title, JSON.stringify(config));

          // 6. Return preview
          const feedUrl = `/feed/${feedId}.xml`;
          return Response.json({
            feedId,
            feedUrl,
            preview,
            parserConfig: config,
          });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Internal error";
          console.error("Generate error:", err);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },

    "/api/feeds/:id": {
      GET(req) {
        const feed = getFeed(req.params.id);
        if (!feed) {
          return Response.json({ error: "Feed not found" }, { status: 404 });
        }
        return Response.json({
          feedId: feed.id,
          url: feed.url,
          title: feed.title,
          feedUrl: `/feed/${feed.id}.xml`,
          parserConfig: JSON.parse(feed.parser_config),
          createdAt: feed.created_at,
        });
      },
    },

    "/feed/:id": {
      async GET(req) {
        // Strip .xml suffix if present
        const feedId = req.params.id.replace(/\.xml$/, "");
        const feed = getFeed(feedId);
        if (!feed) {
          return new Response("Feed not found", { status: 404 });
        }

        // Check cache
        const cached = getCachedFeed(feedId);
        if (cached) {
          return new Response(cached, {
            headers: {
              "Content-Type": "application/rss+xml; charset=utf-8",
              "Cache-Control": "public, max-age=900",
            },
          });
        }

        // Fetch, parse, generate
        try {
          const html = await fetchPage(feed.url);
          const config: ParserConfig = JSON.parse(feed.parser_config);
          const extracted = parseHtml(html, config, feed.url);

          const host = req.headers.get("host") || "localhost";
          const proto = req.headers.get("x-forwarded-proto") || "http";
          const selfUrl = `${proto}://${host}/feed/${feedId}.xml`;
          const xml = generateRssXml(extracted, selfUrl);

          setCachedFeed(feedId, xml);

          return new Response(xml, {
            headers: {
              "Content-Type": "application/rss+xml; charset=utf-8",
              "Cache-Control": "public, max-age=900",
            },
          });
        } catch (err: unknown) {
          console.error(`Feed ${feedId} fetch error:`, err);
          return new Response("Failed to fetch source page", { status: 502 });
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`RSS-O-Matic running on http://localhost:${port}`);

export default defineEventHandler(async (event) => {
  const feedId = getRouterParam(event, "feedId");
  const itemId = getRouterParam(event, "itemId");

  if (!feedId || !itemId) {
    throw createError({ statusCode: 400, statusMessage: "Missing parameters" });
  }

  const feed = await getNewsletterFeed(feedId);
  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: "Newsletter feed not found" });
  }

  const item = await getNewsletterItem(itemId);
  if (!item || item.feed_id !== feedId) {
    throw createError({ statusCode: 404, statusMessage: "Newsletter item not found" });
  }

  const content = item.content_html || escapeHtml(item.content_text || "");
  const authorLine = item.author_name || item.author_email || "";
  const date = new Date(item.received_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(item.title)} — RSS-O-Matic</title>
  <link rel="preconnect" href="https://fonts.bunny.net">
  <link rel="stylesheet" href="https://fonts.bunny.net/css?family=dela-gothic-one:400|jost:400,500,600,700&display=fallback">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Jost', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #c2dad5;
      color: #2a2622;
      min-height: 100vh;
    }
    .header {
      background-color: #18665c;
      text-align: center;
      padding: 1.5rem 1rem;
      border-bottom: 4px solid #0e3e38;
    }
    .header a {
      font-family: 'Dela Gothic One', sans-serif;
      font-size: 1.5rem;
      color: #fff;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    .meta-bar {
      background: #fefefe;
      border: 2px solid #8aada4;
      border-radius: 4px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);
    }
    .meta-bar h1 {
      font-size: 1.3rem;
      margin-bottom: 0.3rem;
    }
    .meta-bar .meta {
      font-size: 0.85rem;
      color: #6a8882;
    }
    .email-content {
      background: #fefefe;
      border: 2px solid #8aada4;
      border-radius: 4px;
      padding: 1.5rem;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);
      line-height: 1.6;
      overflow-wrap: break-word;
    }
    .email-content img { max-width: 100%; height: auto; }
    .back-link {
      display: inline-block;
      margin-top: 1.5rem;
      color: #15605a;
      font-weight: 600;
      text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <a href="/">RSS-O-Matic</a>
  </div>
  <div class="container">
    <div class="meta-bar">
      <h1>${escapeHtml(item.title)}</h1>
      <p class="meta">
        ${authorLine ? `From: ${escapeHtml(authorLine)} &middot; ` : ""}${date}
        &middot; via <em>${escapeHtml(feed.title)}</em>
      </p>
    </div>
    <div class="email-content">
      ${content}
    </div>
    <a href="/feed/${feedId}.xml" class="back-link">&larr; Back to feed</a>
  </div>
</body>
</html>`;
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

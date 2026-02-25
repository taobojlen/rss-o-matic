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

  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");

  if (item.content_html) {
    return item.content_html;
  }

  const textContent = escapeHtml(item.content_text || "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(item.title)}</title>
</head>
<body>
  <pre>${textContent}</pre>
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

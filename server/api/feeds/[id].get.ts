export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing feed ID" });
  }

  const feed = await getFeed(id);
  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: "Feed not found" });
  }

  return {
    feedId: feed.id,
    url: feed.url,
    title: feed.title,
    feedUrl: `/feed/${feed.id}.atom`,
    rssUrl: `/feed/${feed.id}.rss`,
    parserConfig: JSON.parse(feed.parser_config),
    createdAt: feed.created_at,
  };
});

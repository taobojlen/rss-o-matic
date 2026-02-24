export default defineEventHandler(async () => {
  const feeds = await getPopularFeeds(5);
  return feeds.map((feed) => ({
    id: feed.id,
    title: feed.title,
    url: feed.url,
    feedUrl: `/feed/${feed.id}.xml`,
    fetchCount: feed.fetch_count,
  }));
});

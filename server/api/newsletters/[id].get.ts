export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing newsletter feed ID" });
  }

  const feed = await getNewsletterFeed(id);
  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: "Newsletter feed not found" });
  }

  const itemCount = await getNewsletterItemCount(id);

  const host = getRequestHeader(event, "host") || "localhost";
  const proto = getRequestHeader(event, "x-forwarded-proto") || "https";

  return {
    id: feed.id,
    title: feed.title,
    emailAddress: feed.email_address,
    feedUrl: `/feed/${feed.id}.atom`,
    fullFeedUrl: `${proto}://${host}/feed/${feed.id}.atom`,
    itemCount,
    createdAt: feed.created_at,
  };
});

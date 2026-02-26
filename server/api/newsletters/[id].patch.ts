export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing newsletter feed ID",
    });
  }

  const body = await readBody(event);
  const title = body?.title?.trim();

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: "A name for your newsletter inbox is required.",
    });
  }

  if (title.length > 200) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "That name is a bit long, partner. Keep it under 200 characters.",
    });
  }

  const feed = await getNewsletterFeed(id);
  if (!feed) {
    throw createError({
      statusCode: 404,
      statusMessage: "Newsletter feed not found",
    });
  }

  await updateNewsletterFeedTitle(id, title);

  const host = getRequestHeader(event, "host") || "localhost";
  const proto = getRequestHeader(event, "x-forwarded-proto") || "https";

  return {
    id: feed.id,
    title,
    emailAddress: feed.email_address,
    feedUrl: `/feed/${feed.id}.atom`,
    fullFeedUrl: `${proto}://${host}/feed/${feed.id}.atom`,
    itemCount: await getNewsletterItemCount(id),
    createdAt: feed.created_at,
  };
});

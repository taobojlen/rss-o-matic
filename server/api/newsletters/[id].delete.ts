export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing newsletter feed ID",
    });
  }

  const feed = await getNewsletterFeed(id);
  if (!feed) {
    throw createError({
      statusCode: 404,
      statusMessage: "Newsletter feed not found",
    });
  }

  await deleteNewsletterFeed(id);

  return { deleted: true };
});

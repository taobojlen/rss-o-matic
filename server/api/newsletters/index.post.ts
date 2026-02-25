import { nanoid } from "nanoid";

const EMAIL_DOMAIN = "inbox.rss-o-matic.com";

export default defineEventHandler(async (event) => {
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
      statusMessage: "That name is a bit long, partner. Keep it under 200 characters.",
    });
  }

  const feedId = nanoid(12);
  const emailAddress = `${feedId}@${EMAIL_DOMAIN}`;

  await createNewsletterFeed(feedId, title, emailAddress);

  const host = getRequestHeader(event, "host") || "localhost";
  const proto = getRequestHeader(event, "x-forwarded-proto") || "https";
  const feedUrl = `/feed/${feedId}.xml`;

  return {
    id: feedId,
    title,
    emailAddress,
    feedUrl,
    fullFeedUrl: `${proto}://${host}${feedUrl}`,
  };
});

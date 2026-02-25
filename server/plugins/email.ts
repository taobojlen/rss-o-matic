import PostalMime from "postal-mime";
import { nanoid } from "nanoid";
import { sanitizeEmailHtml } from "../utils/sanitize-email";
import {
  getNewsletterFeedByEmail,
  addNewsletterItem,
} from "../utils/newsletter-db";
import { invalidateCachedFeed } from "../utils/cache";

const MAX_EMAIL_SIZE = 5 * 1024 * 1024; // 5 MiB

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:email" as any, async (message: any) => {
    const to = message.to;
    const rawSize = message.rawSize;

    // Reject oversized emails
    if (rawSize > MAX_EMAIL_SIZE) {
      message.setReject("Message too large (max 5 MiB)");
      return;
    }

    // Extract feed ID from email address local part
    const localPart = to.split("@")[0];
    if (!localPart) {
      message.setReject("Invalid recipient");
      return;
    }

    // Look up the newsletter feed
    const feed = await getNewsletterFeedByEmail(to);
    if (!feed) {
      message.setReject("Unknown recipient");
      return;
    }

    // Read and parse the raw email
    const rawEmail = new Response(message.raw);
    const rawBytes = await rawEmail.arrayBuffer();
    const parser = new PostalMime();
    const parsed = await parser.parse(rawBytes);

    const subject = parsed.subject || "(No subject)";
    const authorName = parsed.from?.name || null;
    const authorEmail = parsed.from?.address || message.from || null;
    const contentHtml = parsed.html
      ? sanitizeEmailHtml(parsed.html)
      : null;
    const contentText = parsed.text || null;
    const messageId = parsed.messageId || null;

    const itemId = nanoid(12);

    try {
      await addNewsletterItem(
        itemId,
        feed.id,
        subject,
        authorName,
        authorEmail,
        contentHtml,
        contentText,
        messageId
      );
    } catch (err: any) {
      // Duplicate message-id — silently ignore
      if (err?.message?.includes("UNIQUE constraint failed")) {
        return;
      }
      throw err;
    }

    // Invalidate feed cache so new items appear immediately
    await invalidateCachedFeed(feed.id);
  });
});

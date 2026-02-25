CREATE TABLE `newsletter_items` (
  `id` text PRIMARY KEY NOT NULL,
  `feed_id` text NOT NULL,
  `title` text NOT NULL,
  `author_name` text,
  `author_email` text,
  `content_html` text,
  `content_text` text,
  `received_at` text NOT NULL,
  `message_id` text
);

CREATE INDEX `idx_newsletter_items_feed_id` ON `newsletter_items` (`feed_id`);
CREATE UNIQUE INDEX `idx_newsletter_items_message_id` ON `newsletter_items` (`message_id`);
CREATE INDEX `idx_newsletter_items_received_at` ON `newsletter_items` (`received_at`);

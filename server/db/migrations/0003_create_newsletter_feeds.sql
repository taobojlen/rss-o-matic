CREATE TABLE `newsletter_feeds` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `email_address` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `idx_newsletter_feeds_email` ON `newsletter_feeds` (`email_address`);

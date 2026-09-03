PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_push_subscriptions`("id", "user_id", "endpoint", "p256dh", "auth", "created_at", "updated_at") SELECT "id", "owner_id", "endpoint", "p256dh", "auth", "created_at", "updated_at" FROM `push_subscriptions`;--> statement-breakpoint
DROP TABLE `push_subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_push_subscriptions` RENAME TO `push_subscriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user_id` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `requests` ADD `requester_id` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `confirmed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `unavailable_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_requests_requester_id` ON `requests` (`requester_id`);

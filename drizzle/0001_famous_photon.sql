CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`shelf_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_shelf_id` ON `push_subscriptions` (`shelf_id`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_owner_id` ON `push_subscriptions` (`owner_id`);
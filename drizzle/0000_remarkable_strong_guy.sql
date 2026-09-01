CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`shelf_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`photo_batch_id` text,
	`title` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`availability` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_batch_id`) REFERENCES `photo_batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_books_shelf_status` ON `books` (`shelf_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_books_owner_id` ON `books` (`owner_id`);--> statement-breakpoint
CREATE TABLE `photo_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`shelf_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`status` text NOT NULL,
	`book_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_photo_batches_shelf_id` ON `photo_batches` (`shelf_id`);--> statement-breakpoint
CREATE TABLE `request_books` (
	`request_id` text NOT NULL,
	`book_id` text NOT NULL,
	PRIMARY KEY(`request_id`, `book_id`),
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_request_books_book_id` ON `request_books` (`book_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`shelf_id` text NOT NULL,
	`requester_name` text NOT NULL,
	`requester_contact` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_requests_shelf_status` ON `requests` (`shelf_id`,`status`);--> statement-breakpoint
CREATE TABLE `shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_name` text NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`intro` text DEFAULT 'Escolha os livros que você gostaria de receber no nosso próximo encontro.' NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shelves_owner_id` ON `shelves` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shelves_slug` ON `shelves` (`slug`);
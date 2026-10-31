CREATE TABLE `memories` (
	`id` integer PRIMARY KEY NOT NULL,
	`villager_id` text NOT NULL,
	`minute` real NOT NULL,
	`text` text NOT NULL,
	`importance` integer NOT NULL,
	`about` text,
	`last_recalled_minute` real
);
--> statement-breakpoint
CREATE TABLE `promises` (
	`id` integer PRIMARY KEY NOT NULL,
	`villager_id` text NOT NULL,
	`text` text NOT NULL,
	`created_minute` real NOT NULL,
	`due_minute` real NOT NULL,
	`status` text NOT NULL
);

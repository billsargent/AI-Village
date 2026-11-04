CREATE TABLE `meter` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` real NOT NULL,
	`purpose` text NOT NULL,
	`villager_id` text,
	`model` text NOT NULL,
	`tokens_in` integer NOT NULL,
	`tokens_cached` integer NOT NULL,
	`tokens_out` integer NOT NULL,
	`tokens_reasoning` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`ms` real NOT NULL
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `mayor_autonomy` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `monthly_ceiling_usd` real;
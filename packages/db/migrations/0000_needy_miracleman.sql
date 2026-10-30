CREATE TABLE `balances` (
	`account` text NOT NULL,
	`item` text NOT NULL,
	`qty` real NOT NULL,
	PRIMARY KEY(`account`, `item`)
);
--> statement-breakpoint
CREATE TABLE `built_buildings` (
	`building_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chronicle` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`minute` real NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`actors` text NOT NULL,
	`importance` integer NOT NULL,
	`public` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clock` (
	`id` integer PRIMARY KEY NOT NULL,
	`village_seed` integer NOT NULL,
	`minute` real NOT NULL,
	`speed` integer NOT NULL,
	`paused` integer NOT NULL,
	`storyteller_style` text NOT NULL,
	`days_since_last_happening` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`minute` real NOT NULL,
	`from_account` text NOT NULL,
	`to_account` text NOT NULL,
	`item` text NOT NULL,
	`qty` real NOT NULL,
	`reason` text NOT NULL,
	`ref` text
);
--> statement-breakpoint
CREATE TABLE `needs` (
	`villager_id` text PRIMARY KEY NOT NULL,
	`hunger` real NOT NULL,
	`energy` real NOT NULL,
	`social` real NOT NULL,
	`fun` real NOT NULL,
	`comfort` real NOT NULL,
	`purpose` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`pair_key` text PRIMARY KEY NOT NULL,
	`a` text NOT NULL,
	`b` text NOT NULL,
	`affinity` real NOT NULL,
	`familiarity` real NOT NULL,
	`sweetheart_since_day` integer
);
--> statement-breakpoint
CREATE TABLE `villagers` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`skill_level` integer NOT NULL,
	`has_tool` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weather_days` (
	`day` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL
);

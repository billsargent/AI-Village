CREATE TABLE `chat_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`villager_id` text NOT NULL,
	`speaker` text NOT NULL,
	`text` text NOT NULL,
	`at` real NOT NULL
);

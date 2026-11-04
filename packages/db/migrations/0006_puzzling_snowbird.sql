CREATE TABLE `work_requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`villager_id` text NOT NULL,
	`description` text NOT NULL,
	`requested_minute` real NOT NULL
);

CREATE TABLE `orders` (
	`id` integer PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`items` text NOT NULL,
	`reward` real NOT NULL,
	`due_day` integer NOT NULL,
	`status` text NOT NULL
);

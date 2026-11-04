CREATE TABLE `approvals` (
	`id` integer PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`args` text NOT NULL,
	`risk` text NOT NULL,
	`preview` text,
	`requested_by` text NOT NULL,
	`status` text NOT NULL,
	`created_at` real NOT NULL
);

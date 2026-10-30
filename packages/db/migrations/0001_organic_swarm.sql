PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_built_buildings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`building_id` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_built_buildings`("building_id") SELECT "building_id" FROM `built_buildings`;--> statement-breakpoint
DROP TABLE `built_buildings`;--> statement-breakpoint
ALTER TABLE `__new_built_buildings` RENAME TO `built_buildings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
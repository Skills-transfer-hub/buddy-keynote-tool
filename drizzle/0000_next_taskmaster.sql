CREATE TABLE `shared_presence` (
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`slide_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `session_id`)
);
--> statement-breakpoint
CREATE TABLE `shared_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`editor_hash` text NOT NULL,
	`viewer_hash` text NOT NULL,
	`snapshot_key` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE "card_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"season_name" text NOT NULL,
	"short_name" text,
	"card_back_file_id" uuid,
	"card_back_name" text,
	"card_back_width" integer,
	"card_back_height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_season_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "catdex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"twitch_user_name" text NOT NULL,
	"cat_name" text NOT NULL,
	"season_id" uuid NOT NULL,
	"rarity_id" uuid NOT NULL,
	"card_number" text,
	"approved" boolean NOT NULL,
	"default_card_file_id" uuid,
	"default_card_name" text,
	"default_card_width" integer,
	"default_card_height" integer,
	"default_card_thumb_file_id" uuid,
	"default_card_thumb_name" text,
	"default_card_thumb_width" integer,
	"default_card_thumb_height" integer,
	"custom_card_file_id" uuid,
	"custom_card_name" text,
	"custom_card_width" integer,
	"custom_card_height" integer,
	"custom_card_thumb_file_id" uuid,
	"custom_card_thumb_name" text,
	"custom_card_thumb_width" integer,
	"custom_card_thumb_height" integer,
	"thumbnail_status" text,
	"thumbnail_attempted_at" timestamp with time zone,
	"thumbnail_attempt_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catdex_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "catdex_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"token" text NOT NULL,
	"rate_key" text,
	"file_id" uuid,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catdex_uploads_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"artist_name" text NOT NULL,
	"animal" text NOT NULL,
	"link" text NOT NULL,
	"blur_img_file_id" uuid,
	"blur_img_name" text,
	"preview_img_file_id" uuid,
	"preview_img_name" text,
	"full_img_file_id" uuid,
	"full_img_name" text,
	"preview_img_width" integer,
	"preview_img_height" integer,
	"full_img_width" integer,
	"full_img_height" integer,
	"focus_x" double precision,
	"focus_y" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "rarity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"rarity_name" text NOT NULL,
	"stars" integer,
	"chance_percent" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rarity_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "adoption_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"edit_token" text,
	"owner_token_identifier" text,
	"slug" text,
	"title" text,
	"creator_name" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adoption_batch_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "adoption_batch_cats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"cat_data" jsonb NOT NULL,
	"profile_id" uuid,
	"encoded" text,
	"share_token" text,
	"edit_token" text,
	"cat_name" text,
	"creator_name" text,
	CONSTRAINT "adoption_batch_cats_position_nonnegative" CHECK ("adoption_batch_cats"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ancestry_tree" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"edit_token" text,
	"owner_token_identifier" text,
	"name" text NOT NULL,
	"founding_mother_id" text NOT NULL,
	"founding_father_id" text NOT NULL,
	"cats" jsonb NOT NULL,
	"config" jsonb NOT NULL,
	"creator_name" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ancestry_tree_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "cat_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"cat_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"filename" text,
	"meta" jsonb,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cat_images_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "cat_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"cat_data" jsonb NOT NULL,
	"cat_name" text,
	"creator_name" text,
	"owner_token_identifier" text,
	"edit_token" text,
	"adoption_batch_id" uuid,
	"previews_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cat_profile_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "cat_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"edit_token" text,
	"owner_token_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cat_shares_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "discord_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"token" text NOT NULL,
	"answer_hash" text NOT NULL,
	"salt" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "discord_challenge_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "discord_user_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"discord_user_id" text NOT NULL,
	"accessories_min" integer NOT NULL,
	"accessories_max" integer NOT NULL,
	"scars_min" integer NOT NULL,
	"scars_max" integer NOT NULL,
	"torties_min" integer NOT NULL,
	"torties_max" integer NOT NULL,
	"dark_forest" boolean NOT NULL,
	"starclan" boolean NOT NULL,
	"palettes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_user_configs_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "coinflipper_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"player_name" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coinflipper_scores_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "perfect_cats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"hash" text NOT NULL,
	"params" jsonb NOT NULL,
	"rating" double precision NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"appearances" integer NOT NULL,
	"last_shown_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfect_cats_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "perfect_matchups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"client_id" text NOT NULL,
	"cat_a_id" uuid NOT NULL,
	"cat_b_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfect_matchups_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "perfect_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"cat_a_id" uuid NOT NULL,
	"cat_b_id" uuid NOT NULL,
	"winner_id" uuid NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfect_votes_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "import_checkpoints" (
	"archive_sha256" text NOT NULL,
	"step" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rows" integer NOT NULL,
	"stats" jsonb NOT NULL,
	"run_id" uuid NOT NULL,
	CONSTRAINT "import_checkpoints_archive_sha256_step_pk" PRIMARY KEY("archive_sha256","step")
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_sha256" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"report" jsonb
);
--> statement-breakpoint
CREATE TABLE "import_storage_map" (
	"archive_sha256" text NOT NULL,
	"storage_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "import_storage_map_archive_sha256_storage_id_pk" PRIMARY KEY("archive_sha256","storage_id")
);
--> statement-breakpoint
CREATE TABLE "quick_share_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"ip_hash" text NOT NULL,
	"raw_ip" text,
	"raw_ip_expires_at" timestamp with time zone,
	"reason" text,
	"active" boolean NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "quick_share_bans_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "quick_share_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"upload_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer NOT NULL,
	"lease_id" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_share_jobs_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "quick_share_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"upload_id" uuid NOT NULL,
	"part_number" integer NOT NULL,
	"etag" text NOT NULL,
	"size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_share_parts_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "quick_share_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"original_name" text NOT NULL,
	"declared_mime" text,
	"detected_mime" text,
	"original_size" bigint NOT NULL,
	"original_key" text NOT NULL,
	"multipart_upload_id" text,
	"public_key" text,
	"public_mime" text,
	"public_size" bigint,
	"import_reserved_bytes" bigint,
	"state" text NOT NULL,
	"receipt_hash" text NOT NULL,
	"owner_token_identifier" text,
	"rate_identity" text NOT NULL,
	"ip_hash" text NOT NULL,
	"raw_ip" text NOT NULL,
	"public_expires_at" timestamp with time zone NOT NULL,
	"retained_until" timestamp with time zone NOT NULL,
	"active" boolean NOT NULL,
	"extended_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"failure_message" text,
	"compatibility_warning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_share_uploads_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "quick_share_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"identity" text NOT NULL,
	"kind" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"starts" integer NOT NULL,
	"bytes" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_share_usage_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "dash_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"config" jsonb NOT NULL,
	"edit_token" text,
	"owner_token_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dash_settings_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "palette_generator_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"config" jsonb NOT NULL,
	"image_file_id" uuid,
	"edit_token" text,
	"owner_token_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "palette_generator_settings_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "pixelator_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"config" jsonb NOT NULL,
	"edit_token" text,
	"owner_token_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pixelator_settings_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "single_cat_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"slug" text NOT NULL,
	"config" jsonb NOT NULL,
	"edit_token" text,
	"owner_token_identifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "single_cat_settings_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "user_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"variant_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"settings" jsonb NOT NULL,
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_variants_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "cat_stream_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"settings" jsonb NOT NULL,
	"current_command" jsonb,
	"test_mode" boolean NOT NULL,
	"last_wheel_spin_for_seq" integer,
	"batch_state" jsonb,
	"evolution_state" jsonb,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cat_stream_sessions_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "cat_stream_sessions_command_size" CHECK (octet_length("cat_stream_sessions"."current_command"::text) <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "stream_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"session_id" uuid NOT NULL,
	"viewer_session" text,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_participants_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"owner_token_identifier" text,
	"allowed_options" text[],
	"vote_round" integer,
	"viewer_key" text NOT NULL,
	"status" text NOT NULL,
	"current_step" text,
	"step_index" integer,
	"step_history" jsonb,
	"params" jsonb,
	"allow_repeat_ips" boolean,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_sessions_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "stream_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"vote_round" integer,
	"session_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"option_key" text NOT NULL,
	"option_meta" jsonb,
	"voted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_votes_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "wheel_spins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"prize_name" text NOT NULL,
	"forced" boolean NOT NULL,
	"random_bucket" double precision,
	"actor_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wheel_spins_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "files_byte_size_matches" CHECK ("files"."byte_size" = octet_length("files"."bytes")),
	CONSTRAINT "files_sha256_format" CHECK ("files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beastypage_schema_version" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer NOT NULL,
	"compatible_from" integer NOT NULL,
	"app_version" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beastypage_schema_version_singleton" CHECK ("beastypage_schema_version"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"legacy_created_at" timestamp with time zone,
	"token_identifier" text NOT NULL,
	"username" text,
	"username_search" text GENERATED ALWAYS AS (nullif(lower(btrim(username)), '')) STORED,
	"show_profile_pic" boolean NOT NULL,
	"api_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[A-Za-z0-9_-]{1,30}$')
);
--> statement-breakpoint
ALTER TABLE "card_season" ADD CONSTRAINT "card_season_card_back_file_id_files_id_fk" FOREIGN KEY ("card_back_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex" ADD CONSTRAINT "catdex_season_id_card_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."card_season"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex" ADD CONSTRAINT "catdex_rarity_id_rarity_id_fk" FOREIGN KEY ("rarity_id") REFERENCES "public"."rarity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex" ADD CONSTRAINT "catdex_default_card_file_id_files_id_fk" FOREIGN KEY ("default_card_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex" ADD CONSTRAINT "catdex_default_card_thumb_file_id_files_id_fk" FOREIGN KEY ("default_card_thumb_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex" ADD CONSTRAINT "catdex_custom_card_file_id_files_id_fk" FOREIGN KEY ("custom_card_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex" ADD CONSTRAINT "catdex_custom_card_thumb_file_id_files_id_fk" FOREIGN KEY ("custom_card_thumb_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catdex_uploads" ADD CONSTRAINT "catdex_uploads_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_blur_img_file_id_files_id_fk" FOREIGN KEY ("blur_img_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_preview_img_file_id_files_id_fk" FOREIGN KEY ("preview_img_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_full_img_file_id_files_id_fk" FOREIGN KEY ("full_img_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_batch_cats" ADD CONSTRAINT "adoption_batch_cats_batch_id_adoption_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."adoption_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_batch_cats" ADD CONSTRAINT "adoption_batch_cats_profile_id_cat_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."cat_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cat_images" ADD CONSTRAINT "cat_images_cat_profile_id_cat_profile_id_fk" FOREIGN KEY ("cat_profile_id") REFERENCES "public"."cat_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cat_images" ADD CONSTRAINT "cat_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cat_profile" ADD CONSTRAINT "cat_profile_adoption_batch_id_adoption_batch_id_fk" FOREIGN KEY ("adoption_batch_id") REFERENCES "public"."adoption_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfect_matchups" ADD CONSTRAINT "perfect_matchups_cat_a_id_perfect_cats_id_fk" FOREIGN KEY ("cat_a_id") REFERENCES "public"."perfect_cats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfect_matchups" ADD CONSTRAINT "perfect_matchups_cat_b_id_perfect_cats_id_fk" FOREIGN KEY ("cat_b_id") REFERENCES "public"."perfect_cats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfect_votes" ADD CONSTRAINT "perfect_votes_cat_a_id_perfect_cats_id_fk" FOREIGN KEY ("cat_a_id") REFERENCES "public"."perfect_cats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfect_votes" ADD CONSTRAINT "perfect_votes_cat_b_id_perfect_cats_id_fk" FOREIGN KEY ("cat_b_id") REFERENCES "public"."perfect_cats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfect_votes" ADD CONSTRAINT "perfect_votes_winner_id_perfect_cats_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."perfect_cats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_share_jobs" ADD CONSTRAINT "quick_share_jobs_upload_id_quick_share_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."quick_share_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_share_parts" ADD CONSTRAINT "quick_share_parts_upload_id_quick_share_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."quick_share_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "palette_generator_settings" ADD CONSTRAINT "palette_generator_settings_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_variants" ADD CONSTRAINT "user_variants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cat_stream_sessions" ADD CONSTRAINT "cat_stream_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_participants" ADD CONSTRAINT "stream_participants_session_id_stream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_votes" ADD CONSTRAINT "stream_votes_session_id_stream_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_votes" ADD CONSTRAINT "stream_votes_voted_by_stream_participants_id_fk" FOREIGN KEY ("voted_by") REFERENCES "public"."stream_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_season_name_idx" ON "card_season" USING btree ("season_name");--> statement-breakpoint
CREATE INDEX "card_season_short_idx" ON "card_season" USING btree ("short_name");--> statement-breakpoint
CREATE INDEX "card_season_created_idx" ON "card_season" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "catdex_season_idx" ON "catdex" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "catdex_rarity_idx" ON "catdex" USING btree ("rarity_id");--> statement-breakpoint
CREATE INDEX "catdex_approved_idx" ON "catdex" USING btree ("approved");--> statement-breakpoint
CREATE INDEX "catdex_owner_idx" ON "catdex" USING btree ("twitch_user_name");--> statement-breakpoint
CREATE INDEX "catdex_thumbnail_idx" ON "catdex" USING btree ("thumbnail_status","thumbnail_attempted_at");--> statement-breakpoint
CREATE INDEX "catdex_created_idx" ON "catdex" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "catdex_uploads_token_key" ON "catdex_uploads" USING btree ("token");--> statement-breakpoint
CREATE INDEX "catdex_uploads_file_idx" ON "catdex_uploads" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "catdex_uploads_created_idx" ON "catdex_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "catdex_uploads_rate_idx" ON "catdex_uploads" USING btree ("rate_key","created_at");--> statement-breakpoint
CREATE INDEX "catdex_uploads_expires_idx" ON "catdex_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "collection_artist_idx" ON "collection" USING btree ("artist_name");--> statement-breakpoint
CREATE INDEX "collection_created_idx" ON "collection" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rarity_name_idx" ON "rarity" USING btree ("rarity_name");--> statement-breakpoint
CREATE UNIQUE INDEX "adoption_batch_slug_key" ON "adoption_batch" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "adoption_batch_created_idx" ON "adoption_batch" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "adoption_batch_owner_idx" ON "adoption_batch" USING btree ("owner_token_identifier","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "adoption_batch_cats_position_key" ON "adoption_batch_cats" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "adoption_batch_cats_profile_idx" ON "adoption_batch_cats" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ancestry_tree_slug_key" ON "ancestry_tree" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ancestry_tree_created_idx" ON "ancestry_tree" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cat_images_profile_idx" ON "cat_images" USING btree ("cat_profile_id");--> statement-breakpoint
CREATE INDEX "cat_images_profile_kind_idx" ON "cat_images" USING btree ("cat_profile_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "cat_profile_slug_key" ON "cat_profile" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cat_profile_created_idx" ON "cat_profile" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cat_profile_batch_idx" ON "cat_profile" USING btree ("adoption_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cat_shares_slug_key" ON "cat_shares" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cat_shares_created_idx" ON "cat_shares" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_challenge_token_key" ON "discord_challenge" USING btree ("token");--> statement-breakpoint
CREATE INDEX "discord_challenge_expires_idx" ON "discord_challenge" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_user_configs_discord_user_key" ON "discord_user_configs" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "coinflipper_scores_score_idx" ON "coinflipper_scores" USING btree ("score","created_at");--> statement-breakpoint
CREATE INDEX "coinflipper_scores_created_idx" ON "coinflipper_scores" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "perfect_cats_hash_key" ON "perfect_cats" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "perfect_cats_rating_idx" ON "perfect_cats" USING btree ("rating","created_at");--> statement-breakpoint
CREATE INDEX "perfect_cats_updated_idx" ON "perfect_cats" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "perfect_matchups_client_idx" ON "perfect_matchups" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "perfect_matchups_expires_idx" ON "perfect_matchups" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "perfect_matchups_consumed_expires_idx" ON "perfect_matchups" USING btree ("consumed","expires_at");--> statement-breakpoint
CREATE INDEX "perfect_votes_client_idx" ON "perfect_votes" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "perfect_votes_cats_idx" ON "perfect_votes" USING btree ("cat_a_id","cat_b_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_share_bans_active_ip_key" ON "quick_share_bans" USING btree ("ip_hash") WHERE "quick_share_bans"."active";--> statement-breakpoint
CREATE INDEX "quick_share_bans_ip_active_idx" ON "quick_share_bans" USING btree ("ip_hash","active");--> statement-breakpoint
CREATE INDEX "quick_share_bans_active_created_idx" ON "quick_share_bans" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "quick_share_bans_active_raw_ip_expires_idx" ON "quick_share_bans" USING btree ("active","raw_ip_expires_at");--> statement-breakpoint
CREATE INDEX "quick_share_jobs_status_created_idx" ON "quick_share_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_share_jobs_upload_kind_key" ON "quick_share_jobs" USING btree ("upload_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_share_parts_upload_part_key" ON "quick_share_parts" USING btree ("upload_id","part_number");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_share_uploads_slug_key" ON "quick_share_uploads" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_slug_active_retained_idx" ON "quick_share_uploads" USING btree ("slug","active","retained_until");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_slug_active_state_expires_idx" ON "quick_share_uploads" USING btree ("slug","active","state","public_expires_at");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_receipt_idx" ON "quick_share_uploads" USING btree ("receipt_hash");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_owner_expires_idx" ON "quick_share_uploads" USING btree ("owner_token_identifier","public_expires_at");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_rate_active_idx" ON "quick_share_uploads" USING btree ("rate_identity","active");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_ip_active_idx" ON "quick_share_uploads" USING btree ("ip_hash","active");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_ip_created_idx" ON "quick_share_uploads" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_state_created_idx" ON "quick_share_uploads" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_state_updated_idx" ON "quick_share_uploads" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_active_expires_idx" ON "quick_share_uploads" USING btree ("active","public_expires_at");--> statement-breakpoint
CREATE INDEX "quick_share_uploads_retained_idx" ON "quick_share_uploads" USING btree ("retained_until");--> statement-breakpoint
CREATE UNIQUE INDEX "quick_share_usage_window_key" ON "quick_share_usage" USING btree ("identity","kind","window_start");--> statement-breakpoint
CREATE INDEX "quick_share_usage_expires_idx" ON "quick_share_usage" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dash_settings_slug_key" ON "dash_settings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "dash_settings_created_idx" ON "dash_settings" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "palette_generator_settings_slug_key" ON "palette_generator_settings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "palette_generator_settings_created_idx" ON "palette_generator_settings" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pixelator_settings_slug_key" ON "pixelator_settings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pixelator_settings_created_idx" ON "pixelator_settings" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "single_cat_settings_slug_key" ON "single_cat_settings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "single_cat_settings_created_idx" ON "single_cat_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_variants_user_tool_idx" ON "user_variants" USING btree ("user_id","tool_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_variants_user_variant_key" ON "user_variants" USING btree ("user_id","tool_key","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cat_stream_sessions_user_key" ON "cat_stream_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_participants_session_idx" ON "stream_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "stream_participants_viewer_session_idx" ON "stream_participants" USING btree ("viewer_session");--> statement-breakpoint
CREATE INDEX "stream_participants_session_viewer_idx" ON "stream_participants" USING btree ("session_id","viewer_session");--> statement-breakpoint
CREATE INDEX "stream_participants_session_fingerprint_idx" ON "stream_participants" USING btree ("session_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_sessions_viewer_key_key" ON "stream_sessions" USING btree ("viewer_key");--> statement-breakpoint
CREATE INDEX "stream_sessions_status_idx" ON "stream_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stream_sessions_owner_updated_idx" ON "stream_sessions" USING btree ("owner_token_identifier","updated_at");--> statement-breakpoint
CREATE INDEX "stream_sessions_owner_status_updated_idx" ON "stream_sessions" USING btree ("owner_token_identifier","status","updated_at");--> statement-breakpoint
CREATE INDEX "stream_votes_session_idx" ON "stream_votes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "stream_votes_step_idx" ON "stream_votes" USING btree ("session_id","step_id");--> statement-breakpoint
CREATE INDEX "stream_votes_session_round_idx" ON "stream_votes" USING btree ("session_id","vote_round");--> statement-breakpoint
CREATE INDEX "stream_votes_session_round_voter_idx" ON "stream_votes" USING btree ("session_id","vote_round","voted_by");--> statement-breakpoint
CREATE INDEX "wheel_spins_prize_idx" ON "wheel_spins" USING btree ("prize_name");--> statement-breakpoint
CREATE INDEX "wheel_spins_created_idx" ON "wheel_spins" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wheel_spins_actor_created_idx" ON "wheel_spins" USING btree ("actor_key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "files_sha256_key" ON "files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "job_runs_kind_created_idx" ON "job_runs" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_active_dedupe_key" ON "jobs" USING btree ("kind","dedupe_key") WHERE "jobs"."status" in ('pending', 'running') and "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("run_after") WHERE "jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "jobs_lease_idx" ON "jobs" USING btree ("lease_expires_at") WHERE "jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "jobs_dead_idx" ON "jobs" USING btree ("updated_at") WHERE "jobs"."status" = 'dead';--> statement-breakpoint
CREATE INDEX "live_events_topic_id_idx" ON "live_events" USING btree ("topic","id");--> statement-breakpoint
CREATE INDEX "live_events_created_at_idx" ON "live_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_token_identifier_key" ON "users" USING btree ("token_identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_username_search_idx" ON "users" USING btree ("username_search" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_api_key_key" ON "users" USING btree ("api_key");
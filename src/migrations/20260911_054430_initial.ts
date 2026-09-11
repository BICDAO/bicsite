import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_memes_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__memes_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_liquid_assets_blockchain" AS ENUM('Ethereum', 'Solana', 'Base');
  CREATE TYPE "public"."enum_liquid_assets_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__liquid_assets_v_version_blockchain" AS ENUM('Ethereum', 'Solana', 'Base');
  CREATE TYPE "public"."enum__liquid_assets_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor', 'dev', 'writer', 'user');
  CREATE TYPE "public"."enum_site_nav_socials_platform" AS ENUM('x', 'discord', 'telegram', 'dexscreener');
  CREATE TABLE "memes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"creator" varchar,
  	"date_acquired" timestamp(3) with time zone,
  	"is_meme_nft" boolean,
  	"is_token" boolean,
  	"is_physical" boolean,
  	"know_your_meme_url" varchar,
  	"provenance_url" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"thumbnail_id" integer,
  	"sort_order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_memes_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_memes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_creator" varchar,
  	"version_date_acquired" timestamp(3) with time zone,
  	"version_is_meme_nft" boolean,
  	"version_is_token" boolean,
  	"version_is_physical" boolean,
  	"version_know_your_meme_url" varchar,
  	"version_provenance_url" varchar,
  	"version_description" varchar,
  	"version_image_id" integer,
  	"version_thumbnail_id" integer,
  	"version_sort_order" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__memes_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "liquid_assets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"slug" varchar,
  	"creator" varchar,
  	"ticker" varchar,
  	"blockchain" "enum_liquid_assets_blockchain",
  	"coingecko_url" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"thumbnail_id" integer,
  	"sort_order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_liquid_assets_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_liquid_assets_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_slug" varchar,
  	"version_creator" varchar,
  	"version_ticker" varchar,
  	"version_blockchain" "enum__liquid_assets_v_version_blockchain",
  	"version_coingecko_url" varchar,
  	"version_description" varchar,
  	"version_image_id" integer,
  	"version_thumbnail_id" integer,
  	"version_sort_order" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__liquid_assets_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar,
  	"username" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "wallets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"address" varchar NOT NULL,
  	"user_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"memes_id" integer,
  	"liquid_assets_id" integer,
  	"media_id" integer,
  	"users_id" integer,
  	"wallets_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "home_hero_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "home_explainer_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category" varchar,
  	"title" varchar,
  	"subtitle" varchar,
  	"body" jsonb,
  	"link_label" varchar,
  	"link_href" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "home_manifesto_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar
  );
  
  CREATE TABLE "home" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hero_title" varchar,
  	"explainer_label" varchar,
  	"treasury_label" varchar,
  	"treasury_nfts_label" varchar,
  	"treasury_tokens_label" varchar,
  	"manifesto_label" varchar,
  	"manifesto_title" varchar,
  	"manifesto_link_label" varchar,
  	"manifesto_link_href" varchar,
  	"creators_label" varchar,
  	"creators_category" varchar,
  	"creators_title" varchar,
  	"creators_subtitle" varchar,
  	"creators_body" jsonb,
  	"creators_link_label" varchar,
  	"creators_link_href" varchar,
  	"creators_image_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "home_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"memes_id" integer
  );
  
  CREATE TABLE "provenance_mission_blocks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" jsonb
  );
  
  CREATE TABLE "provenance" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hero_title" varchar,
  	"hero_subtitle" varchar,
  	"hero_image_id" integer,
  	"mission_label" varchar,
  	"mission_link_label" varchar,
  	"mission_link_href" varchar,
  	"records_label" varchar,
  	"records_link_label" varchar,
  	"records_link_href" varchar,
  	"records_note" varchar,
  	"feature_label" varchar,
  	"feature_category" varchar,
  	"feature_title" varchar,
  	"feature_subtitle" varchar,
  	"feature_body" jsonb,
  	"feature_link_label" varchar,
  	"feature_link_href" varchar,
  	"feature_image_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "site_nav_socials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_site_nav_socials_platform" NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site_footer_org_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site_footer_token_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site_footer_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"description" varchar,
  	"og_image_id" integer,
  	"nav_cta_label" varchar,
  	"nav_cta_href" varchar,
  	"cta_label" varchar,
  	"cta_title" varchar,
  	"cta_link_label" varchar,
  	"cta_link_href" varchar,
  	"footer_contract" varchar,
  	"footer_copyright" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "memes" ADD CONSTRAINT "memes_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "memes" ADD CONSTRAINT "memes_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_memes_v" ADD CONSTRAINT "_memes_v_parent_id_memes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."memes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_memes_v" ADD CONSTRAINT "_memes_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_memes_v" ADD CONSTRAINT "_memes_v_version_thumbnail_id_media_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "liquid_assets" ADD CONSTRAINT "liquid_assets_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "liquid_assets" ADD CONSTRAINT "liquid_assets_thumbnail_id_media_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_liquid_assets_v" ADD CONSTRAINT "_liquid_assets_v_parent_id_liquid_assets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."liquid_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_liquid_assets_v" ADD CONSTRAINT "_liquid_assets_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_liquid_assets_v" ADD CONSTRAINT "_liquid_assets_v_version_thumbnail_id_media_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_memes_fk" FOREIGN KEY ("memes_id") REFERENCES "public"."memes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_liquid_assets_fk" FOREIGN KEY ("liquid_assets_id") REFERENCES "public"."liquid_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wallets_fk" FOREIGN KEY ("wallets_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_hero_links" ADD CONSTRAINT "home_hero_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_explainer_cards" ADD CONSTRAINT "home_explainer_cards_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "home_explainer_cards" ADD CONSTRAINT "home_explainer_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_manifesto_items" ADD CONSTRAINT "home_manifesto_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home" ADD CONSTRAINT "home_creators_image_id_media_id_fk" FOREIGN KEY ("creators_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "home_rels" ADD CONSTRAINT "home_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."home"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_rels" ADD CONSTRAINT "home_rels_memes_fk" FOREIGN KEY ("memes_id") REFERENCES "public"."memes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "provenance_mission_blocks" ADD CONSTRAINT "provenance_mission_blocks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."provenance"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "provenance" ADD CONSTRAINT "provenance_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "provenance" ADD CONSTRAINT "provenance_feature_image_id_media_id_fk" FOREIGN KEY ("feature_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_nav_socials" ADD CONSTRAINT "site_nav_socials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_footer_org_links" ADD CONSTRAINT "site_footer_org_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_footer_token_links" ADD CONSTRAINT "site_footer_token_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_footer_social_links" ADD CONSTRAINT "site_footer_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site" ADD CONSTRAINT "site_og_image_id_media_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "memes_slug_idx" ON "memes" USING btree ("slug");
  CREATE INDEX "memes_image_idx" ON "memes" USING btree ("image_id");
  CREATE INDEX "memes_thumbnail_idx" ON "memes" USING btree ("thumbnail_id");
  CREATE INDEX "memes_sort_order_idx" ON "memes" USING btree ("sort_order");
  CREATE INDEX "memes_updated_at_idx" ON "memes" USING btree ("updated_at");
  CREATE INDEX "memes_created_at_idx" ON "memes" USING btree ("created_at");
  CREATE INDEX "memes__status_idx" ON "memes" USING btree ("_status");
  CREATE INDEX "_memes_v_parent_idx" ON "_memes_v" USING btree ("parent_id");
  CREATE INDEX "_memes_v_version_version_slug_idx" ON "_memes_v" USING btree ("version_slug");
  CREATE INDEX "_memes_v_version_version_image_idx" ON "_memes_v" USING btree ("version_image_id");
  CREATE INDEX "_memes_v_version_version_thumbnail_idx" ON "_memes_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_memes_v_version_version_sort_order_idx" ON "_memes_v" USING btree ("version_sort_order");
  CREATE INDEX "_memes_v_version_version_updated_at_idx" ON "_memes_v" USING btree ("version_updated_at");
  CREATE INDEX "_memes_v_version_version_created_at_idx" ON "_memes_v" USING btree ("version_created_at");
  CREATE INDEX "_memes_v_version_version__status_idx" ON "_memes_v" USING btree ("version__status");
  CREATE INDEX "_memes_v_created_at_idx" ON "_memes_v" USING btree ("created_at");
  CREATE INDEX "_memes_v_updated_at_idx" ON "_memes_v" USING btree ("updated_at");
  CREATE INDEX "_memes_v_latest_idx" ON "_memes_v" USING btree ("latest");
  CREATE UNIQUE INDEX "liquid_assets_slug_idx" ON "liquid_assets" USING btree ("slug");
  CREATE INDEX "liquid_assets_image_idx" ON "liquid_assets" USING btree ("image_id");
  CREATE INDEX "liquid_assets_thumbnail_idx" ON "liquid_assets" USING btree ("thumbnail_id");
  CREATE INDEX "liquid_assets_sort_order_idx" ON "liquid_assets" USING btree ("sort_order");
  CREATE INDEX "liquid_assets_updated_at_idx" ON "liquid_assets" USING btree ("updated_at");
  CREATE INDEX "liquid_assets_created_at_idx" ON "liquid_assets" USING btree ("created_at");
  CREATE INDEX "liquid_assets__status_idx" ON "liquid_assets" USING btree ("_status");
  CREATE INDEX "_liquid_assets_v_parent_idx" ON "_liquid_assets_v" USING btree ("parent_id");
  CREATE INDEX "_liquid_assets_v_version_version_slug_idx" ON "_liquid_assets_v" USING btree ("version_slug");
  CREATE INDEX "_liquid_assets_v_version_version_image_idx" ON "_liquid_assets_v" USING btree ("version_image_id");
  CREATE INDEX "_liquid_assets_v_version_version_thumbnail_idx" ON "_liquid_assets_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_liquid_assets_v_version_version_sort_order_idx" ON "_liquid_assets_v" USING btree ("version_sort_order");
  CREATE INDEX "_liquid_assets_v_version_version_updated_at_idx" ON "_liquid_assets_v" USING btree ("version_updated_at");
  CREATE INDEX "_liquid_assets_v_version_version_created_at_idx" ON "_liquid_assets_v" USING btree ("version_created_at");
  CREATE INDEX "_liquid_assets_v_version_version__status_idx" ON "_liquid_assets_v" USING btree ("version__status");
  CREATE INDEX "_liquid_assets_v_created_at_idx" ON "_liquid_assets_v" USING btree ("created_at");
  CREATE INDEX "_liquid_assets_v_updated_at_idx" ON "_liquid_assets_v" USING btree ("updated_at");
  CREATE INDEX "_liquid_assets_v_latest_idx" ON "_liquid_assets_v" USING btree ("latest");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");
  CREATE UNIQUE INDEX "wallets_address_idx" ON "wallets" USING btree ("address");
  CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");
  CREATE INDEX "wallets_updated_at_idx" ON "wallets" USING btree ("updated_at");
  CREATE INDEX "wallets_created_at_idx" ON "wallets" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_memes_id_idx" ON "payload_locked_documents_rels" USING btree ("memes_id");
  CREATE INDEX "payload_locked_documents_rels_liquid_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("liquid_assets_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_wallets_id_idx" ON "payload_locked_documents_rels" USING btree ("wallets_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "home_hero_links_order_idx" ON "home_hero_links" USING btree ("_order");
  CREATE INDEX "home_hero_links_parent_id_idx" ON "home_hero_links" USING btree ("_parent_id");
  CREATE INDEX "home_explainer_cards_order_idx" ON "home_explainer_cards" USING btree ("_order");
  CREATE INDEX "home_explainer_cards_parent_id_idx" ON "home_explainer_cards" USING btree ("_parent_id");
  CREATE INDEX "home_explainer_cards_image_idx" ON "home_explainer_cards" USING btree ("image_id");
  CREATE INDEX "home_manifesto_items_order_idx" ON "home_manifesto_items" USING btree ("_order");
  CREATE INDEX "home_manifesto_items_parent_id_idx" ON "home_manifesto_items" USING btree ("_parent_id");
  CREATE INDEX "home_creators_creators_image_idx" ON "home" USING btree ("creators_image_id");
  CREATE INDEX "home_rels_order_idx" ON "home_rels" USING btree ("order");
  CREATE INDEX "home_rels_parent_idx" ON "home_rels" USING btree ("parent_id");
  CREATE INDEX "home_rels_path_idx" ON "home_rels" USING btree ("path");
  CREATE INDEX "home_rels_memes_id_idx" ON "home_rels" USING btree ("memes_id");
  CREATE INDEX "provenance_mission_blocks_order_idx" ON "provenance_mission_blocks" USING btree ("_order");
  CREATE INDEX "provenance_mission_blocks_parent_id_idx" ON "provenance_mission_blocks" USING btree ("_parent_id");
  CREATE INDEX "provenance_hero_hero_image_idx" ON "provenance" USING btree ("hero_image_id");
  CREATE INDEX "provenance_feature_feature_image_idx" ON "provenance" USING btree ("feature_image_id");
  CREATE INDEX "site_nav_socials_order_idx" ON "site_nav_socials" USING btree ("_order");
  CREATE INDEX "site_nav_socials_parent_id_idx" ON "site_nav_socials" USING btree ("_parent_id");
  CREATE INDEX "site_footer_org_links_order_idx" ON "site_footer_org_links" USING btree ("_order");
  CREATE INDEX "site_footer_org_links_parent_id_idx" ON "site_footer_org_links" USING btree ("_parent_id");
  CREATE INDEX "site_footer_token_links_order_idx" ON "site_footer_token_links" USING btree ("_order");
  CREATE INDEX "site_footer_token_links_parent_id_idx" ON "site_footer_token_links" USING btree ("_parent_id");
  CREATE INDEX "site_footer_social_links_order_idx" ON "site_footer_social_links" USING btree ("_order");
  CREATE INDEX "site_footer_social_links_parent_id_idx" ON "site_footer_social_links" USING btree ("_parent_id");
  CREATE INDEX "site_og_image_idx" ON "site" USING btree ("og_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "memes" CASCADE;
  DROP TABLE "_memes_v" CASCADE;
  DROP TABLE "liquid_assets" CASCADE;
  DROP TABLE "_liquid_assets_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "wallets" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "home_hero_links" CASCADE;
  DROP TABLE "home_explainer_cards" CASCADE;
  DROP TABLE "home_manifesto_items" CASCADE;
  DROP TABLE "home" CASCADE;
  DROP TABLE "home_rels" CASCADE;
  DROP TABLE "provenance_mission_blocks" CASCADE;
  DROP TABLE "provenance" CASCADE;
  DROP TABLE "site_nav_socials" CASCADE;
  DROP TABLE "site_footer_org_links" CASCADE;
  DROP TABLE "site_footer_token_links" CASCADE;
  DROP TABLE "site_footer_social_links" CASCADE;
  DROP TABLE "site" CASCADE;
  DROP TYPE "public"."enum_memes_status";
  DROP TYPE "public"."enum__memes_v_version_status";
  DROP TYPE "public"."enum_liquid_assets_blockchain";
  DROP TYPE "public"."enum_liquid_assets_status";
  DROP TYPE "public"."enum__liquid_assets_v_version_blockchain";
  DROP TYPE "public"."enum__liquid_assets_v_version_status";
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_site_nav_socials_platform";`)
}

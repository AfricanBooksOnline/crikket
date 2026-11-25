CREATE TABLE "bug_report_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"bug_report_id" text NOT NULL,
	"position" integer NOT NULL,
	"attachment_type" text NOT NULL,
	"capture_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bug_report_upload_session" ADD COLUMN "extra_attachments" jsonb;--> statement-breakpoint
ALTER TABLE "bug_report_attachment" ADD CONSTRAINT "bug_report_attachment_bug_report_id_bug_report_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_report_attachment_bugReportId_position_idx" ON "bug_report_attachment" USING btree ("bug_report_id","position");
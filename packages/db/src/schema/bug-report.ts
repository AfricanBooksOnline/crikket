import { relations, sql } from "drizzle-orm"
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

export const bugReport = pgTable(
  "bug_report",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    description: text("description"),
    status: text("status").default("open").notNull(), // open, in_progress, in_review, resolved, closed
    priority: text("priority").default("none").notNull(), // none, low, medium, high, critical
    tags: text("tags").array(),
    url: text("url"),
    attachmentType: text("attachment_type"), // "video" or "screenshot"
    captureKey: text("capture_key"),
    captureContentType: text("capture_content_type"),
    captureSizeBytes: bigint("capture_size_bytes", { mode: "number" }),
    captureUploadedAt: timestamp("capture_uploaded_at"),
    thumbnailKey: text("thumbnail_key"),
    thumbnailContentType: text("thumbnail_content_type"),
    debuggerKey: text("debugger_key"),
    debuggerContentEncoding: text("debugger_content_encoding"),
    debuggerSizeBytes: bigint("debugger_size_bytes", { mode: "number" }),
    debuggerUploadedAt: timestamp("debugger_uploaded_at"),
    debuggerIngestionStatus: text("debugger_ingestion_status")
      .default("completed")
      .notNull(),
    debuggerIngestionError: text("debugger_ingestion_error"),
    debuggerIngestedAt: timestamp("debugger_ingested_at"),
    submissionStatus: text("submission_status").default("ready").notNull(),
    visibility: text("visibility").default("private").notNull(), // public | private
    metadata: jsonb("metadata"),
    deviceInfo: jsonb("device_info"), // browser, os, viewport, etc.
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bug_report_organizationId_idx").on(table.organizationId),
    index("bug_report_reporterId_idx").on(table.reporterId),
    index("bug_report_submissionStatus_idx").on(table.submissionStatus),
    index("bug_report_debuggerIngestionStatus_idx").on(
      table.debuggerIngestionStatus
    ),
  ]
)

export const bugReportUploadSession = pgTable(
  "bug_report_upload_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    description: text("description"),
    priority: text("priority").default("none").notNull(),
    tags: text("tags").array(),
    url: text("url"),
    attachmentType: text("attachment_type").notNull(),
    visibility: text("visibility").default("private").notNull(),
    captureKey: text("capture_key").notNull(),
    captureContentType: text("capture_content_type").notNull(),
    debuggerKey: text("debugger_key"),
    // AfricanBooks fork: attachments 2..5, copied to bug_report_attachment on finalize.
    extraAttachments:
      jsonb("extra_attachments").$type<PendingExtraAttachment[]>(),
    metadata: jsonb("metadata"),
    deviceInfo: jsonb("device_info"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bug_report_upload_session_organizationId_idx").on(
      table.organizationId
    ),
    index("bug_report_upload_session_expiresAt_idx").on(table.expiresAt),
  ]
)

export const bugReportLog = pgTable(
  "bug_report_log",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    level: text("level").notNull(), // info, warn, error, debug
    message: text("message").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    offset: integer("offset"), // ms from start of recording
    metadata: jsonb("metadata"),
  },
  (table) => [index("bug_report_log_bugReportId_idx").on(table.bugReportId)]
)

export const bugReportNetworkRequest = pgTable(
  "bug_report_network_request",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    url: text("url").notNull(),
    status: integer("status"),
    duration: integer("duration"), // in ms
    requestHeaders: jsonb("request_headers"),
    responseHeaders: jsonb("response_headers"),
    requestBody: text("request_body"),
    responseBody: text("response_body"),
    timestamp: timestamp("timestamp").notNull(),
    offset: integer("offset"), // ms from start of recording
  },
  (table) => [
    index("bug_report_network_request_bugReportId_idx").on(table.bugReportId),
  ]
)

export const bugReportAction = pgTable(
  "bug_report_action",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // click, input, navigation, etc.
    target: text("target"), // selector or element description
    timestamp: timestamp("timestamp").notNull(),
    offset: integer("offset"), // ms from start of recording
    metadata: jsonb("metadata"), // coordinates, key pressed, etc.
  },
  (table) => [index("bug_report_action_bugReportId_idx").on(table.bugReportId)]
)

/** An extra attachment reserved on an upload session, before the report exists. */
export interface PendingExtraAttachment {
  id: string
  position: number
  attachmentType: "video" | "screenshot"
  captureKey: string
  contentType: string
  durationMs: number | null
}

/**
 * Attachments beyond the first (AfricanBooks fork). The first attachment stays
 * on bug_report.capture_key so existing reports, thumbnails and older SDKs keep
 * working unchanged; positions here start at 1.
 */
export const bugReportAttachment = pgTable(
  "bug_report_attachment",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    attachmentType: text("attachment_type").notNull(), // "video" | "screenshot"
    captureKey: text("capture_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("bug_report_attachment_bugReportId_position_idx").on(
      table.bugReportId,
      table.position
    ),
  ]
)

export const bugReportComment = pgTable(
  "bug_report_comment",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    // Kept when the author leaves the organization; shown as "Former member".
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    // Status the comment moved the report to, if any (e.g. "in_review").
    statusChange: text("status_change"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bug_report_comment_bugReportId_createdAt_idx").on(
      table.bugReportId,
      table.createdAt
    ),
  ]
)

export const bugReportArtifactCleanup = pgTable(
  "bug_report_artifact_cleanup",
  {
    id: text("id").primaryKey(),
    artifactKind: text("artifact_kind").notNull(),
    objectKey: text("object_key").notNull().unique(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bug_report_artifact_cleanup_nextAttemptAt_idx").on(
      table.nextAttemptAt
    ),
  ]
)

export const bugReportIngestionJob = pgTable(
  "bug_report_ingestion_job",
  {
    id: text("id").primaryKey(),
    bugReportId: text("bug_report_id")
      .notNull()
      .references(() => bugReport.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bug_report_ingestion_job_bugReportId_idx").on(table.bugReportId),
    index("bug_report_ingestion_job_status_idx").on(table.status),
    index("bug_report_ingestion_job_nextAttemptAt_idx").on(table.nextAttemptAt),
  ]
)

export const capturePublicKey = pgTable(
  "capture_public_key",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    allowedOrigins: text("allowed_origins")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    status: text("status").default("active").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    rotatedAt: timestamp("rotated_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("capture_public_key_organizationId_idx").on(table.organizationId),
    index("capture_public_key_status_idx").on(table.status),
  ]
)

export const bugReportRelations = relations(bugReport, ({ one, many }) => ({
  organization: one(organization, {
    fields: [bugReport.organizationId],
    references: [organization.id],
  }),
  reporter: one(user, {
    fields: [bugReport.reporterId],
    references: [user.id],
  }),
  logs: many(bugReportLog),
  networkRequests: many(bugReportNetworkRequest),
  actions: many(bugReportAction),
  comments: many(bugReportComment),
  attachments: many(bugReportAttachment),
}))

export const bugReportAttachmentRelations = relations(
  bugReportAttachment,
  ({ one }) => ({
    bugReport: one(bugReport, {
      fields: [bugReportAttachment.bugReportId],
      references: [bugReport.id],
    }),
  })
)

export const bugReportCommentRelations = relations(
  bugReportComment,
  ({ one }) => ({
    bugReport: one(bugReport, {
      fields: [bugReportComment.bugReportId],
      references: [bugReport.id],
    }),
    author: one(user, {
      fields: [bugReportComment.authorId],
      references: [user.id],
    }),
  })
)

export const bugReportLogRelations = relations(bugReportLog, ({ one }) => ({
  bugReport: one(bugReport, {
    fields: [bugReportLog.bugReportId],
    references: [bugReport.id],
  }),
}))

export const bugReportNetworkRequestRelations = relations(
  bugReportNetworkRequest,
  ({ one }) => ({
    bugReport: one(bugReport, {
      fields: [bugReportNetworkRequest.bugReportId],
      references: [bugReport.id],
    }),
  })
)

export const bugReportActionRelations = relations(
  bugReportAction,
  ({ one }) => ({
    bugReport: one(bugReport, {
      fields: [bugReportAction.bugReportId],
      references: [bugReport.id],
    }),
  })
)

export const capturePublicKeyRelations = relations(
  capturePublicKey,
  ({ one }) => ({
    organization: one(organization, {
      fields: [capturePublicKey.organizationId],
      references: [organization.id],
    }),
    creator: one(user, {
      fields: [capturePublicKey.createdBy],
      references: [user.id],
    }),
  })
)

import { db } from "@crikket/db"
import { user } from "@crikket/db/schema/auth"
import { bugReport, bugReportComment } from "@crikket/db/schema/bug-report"
import type { BugReportStatus } from "@crikket/shared/constants/bug-report"
import { ORPCError } from "@orpc/server"
import { and, asc, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"

import { isStatus, statusValues } from "../lib/utils"
import { protectedProcedure } from "./context"
import { requireActiveOrgId } from "./helpers"

/**
 * Comments on a bug report (AfricanBooks fork).
 *
 * Only signed-in members of the report's organization can read or write
 * comments — anonymous viewers of a public share link never see them.
 * A comment can also move the report to a new status in the same step
 * ("Comment & Reopen", "Comment & Resolve", ...).
 */

const COMMENT_MAX_LENGTH = 5000

const commentBodySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Comment can't be empty")
      .max(
        COMMENT_MAX_LENGTH,
        `Keep comments under ${COMMENT_MAX_LENGTH} characters`
      )
  )

export interface BugReportCommentItem {
  id: string
  body: string
  statusChange: BugReportStatus | null
  createdAt: string
  updatedAt: string
  edited: boolean
  isMine: boolean
  author: { id: string; name: string; image: string | null } | null
}

async function requireReportInActiveOrg(input: {
  bugReportId: string
  activeOrgId: string
}): Promise<{ status: string }> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.activeOrgId)
    ),
    columns: { status: true },
  })

  if (!report) {
    throw new ORPCError("NOT_FOUND", { message: "Bug report not found" })
  }

  return report
}

async function loadComment(input: { commentId: string; activeOrgId: string }) {
  const [row] = await db
    .select({
      id: bugReportComment.id,
      authorId: bugReportComment.authorId,
    })
    .from(bugReportComment)
    .innerJoin(bugReport, eq(bugReport.id, bugReportComment.bugReportId))
    .where(
      and(
        eq(bugReportComment.id, input.commentId),
        eq(bugReport.organizationId, input.activeOrgId)
      )
    )
    .limit(1)

  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Comment not found" })
  }

  return row
}

function toCommentItem(
  row: {
    id: string
    body: string
    statusChange: string | null
    createdAt: Date
    updatedAt: Date
    authorId: string | null
    authorName: string | null
    authorImage: string | null
  },
  viewerId: string
): BugReportCommentItem {
  return {
    id: row.id,
    body: row.body,
    statusChange:
      row.statusChange && isStatus(row.statusChange) ? row.statusChange : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Allow a second of slack: insert sets both timestamps separately.
    edited: row.updatedAt.getTime() - row.createdAt.getTime() > 1000,
    isMine: row.authorId === viewerId,
    author:
      row.authorId && row.authorName
        ? { id: row.authorId, name: row.authorName, image: row.authorImage }
        : null,
  }
}

const commentSelection = {
  id: bugReportComment.id,
  body: bugReportComment.body,
  statusChange: bugReportComment.statusChange,
  createdAt: bugReportComment.createdAt,
  updatedAt: bugReportComment.updatedAt,
  authorId: bugReportComment.authorId,
  authorName: user.name,
  authorImage: user.image,
}

export const listBugReportComments = protectedProcedure
  .input(z.object({ bugReportId: z.string().min(1) }))
  .handler(async ({ context, input }): Promise<BugReportCommentItem[]> => {
    const activeOrgId = requireActiveOrgId(context.session)
    await requireReportInActiveOrg({
      bugReportId: input.bugReportId,
      activeOrgId,
    })

    const rows = await db
      .select(commentSelection)
      .from(bugReportComment)
      .leftJoin(user, eq(user.id, bugReportComment.authorId))
      .where(eq(bugReportComment.bugReportId, input.bugReportId))
      .orderBy(asc(bugReportComment.createdAt))

    return rows.map((row) => toCommentItem(row, context.session.user.id))
  })

export const addBugReportComment = protectedProcedure
  .input(
    z.object({
      bugReportId: z.string().min(1),
      body: commentBodySchema,
      setStatus: z.enum(statusValues).optional(),
    })
  )
  .handler(async ({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)
    const report = await requireReportInActiveOrg({
      bugReportId: input.bugReportId,
      activeOrgId,
    })

    const statusChange =
      input.setStatus && input.setStatus !== report.status
        ? input.setStatus
        : null
    const commentId = nanoid(16)

    await db.transaction(async (tx) => {
      await tx.insert(bugReportComment).values({
        id: commentId,
        bugReportId: input.bugReportId,
        authorId: context.session.user.id,
        body: input.body,
        statusChange,
      })

      if (statusChange) {
        await tx
          .update(bugReport)
          .set({ status: statusChange })
          .where(eq(bugReport.id, input.bugReportId))
      } else {
        // Bump updatedAt so "recently updated" sorting surfaces the thread.
        await tx
          .update(bugReport)
          .set({ updatedAt: new Date() })
          .where(eq(bugReport.id, input.bugReportId))
      }
    })

    return {
      id: commentId,
      status: (statusChange ?? report.status) as BugReportStatus,
    }
  })

export const editBugReportComment = protectedProcedure
  .input(z.object({ id: z.string().min(1), body: commentBodySchema }))
  .handler(async ({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)
    const comment = await loadComment({ commentId: input.id, activeOrgId })

    if (comment.authorId !== context.session.user.id) {
      throw new ORPCError("FORBIDDEN", {
        message: "You can only edit your own comments",
      })
    }

    await db
      .update(bugReportComment)
      .set({ body: input.body })
      .where(eq(bugReportComment.id, input.id))

    return { id: input.id }
  })

export const deleteBugReportComment = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)
    const comment = await loadComment({ commentId: input.id, activeOrgId })

    if (comment.authorId !== context.session.user.id) {
      throw new ORPCError("FORBIDDEN", {
        message: "You can only delete your own comments",
      })
    }

    await db.delete(bugReportComment).where(eq(bugReportComment.id, input.id))

    return { id: input.id }
  })

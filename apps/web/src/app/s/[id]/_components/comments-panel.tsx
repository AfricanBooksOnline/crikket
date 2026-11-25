"use client"

import {
  BUG_REPORT_STATUS_OPTIONS,
  type BugReportStatus,
} from "@crikket/shared/constants/bug-report"
import { ConfirmationDialog } from "@crikket/ui/components/dialogs/confirmation-dialog"
import { Button } from "@crikket/ui/components/ui/button"
import { Textarea } from "@crikket/ui/components/ui/textarea"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { client, orpc } from "@/utils/orpc"

import { formatStatusLabel } from "./bug-report-header"

const COMMENT_MAX_LENGTH = 5000

interface QuickAction {
  label: string
  status: BugReportStatus
}

/** Status shortcuts offered next to "Comment", based on where the ticket is. */
function getQuickActions(status: BugReportStatus): QuickAction[] {
  switch (status) {
    case BUG_REPORT_STATUS_OPTIONS.inReview:
      return [
        {
          label: "Still broken: reopen",
          status: BUG_REPORT_STATUS_OPTIONS.open,
        },
        {
          label: "Looks good: resolve",
          status: BUG_REPORT_STATUS_OPTIONS.resolved,
        },
      ]
    case BUG_REPORT_STATUS_OPTIONS.resolved:
    case BUG_REPORT_STATUS_OPTIONS.closed:
      return [
        { label: "Comment & reopen", status: BUG_REPORT_STATUS_OPTIONS.open },
      ]
    default:
      return [
        {
          label: "Comment & send for review",
          status: BUG_REPORT_STATUS_OPTIONS.inReview,
        },
      ]
  }
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleString()
}

interface CommentsPanelProps {
  bugReportId: string
  status: BugReportStatus
  /** Called after a comment changed the report's status. */
  onStatusChanged: () => Promise<unknown> | undefined
}

export function CommentsPanel({
  bugReportId,
  status,
  onStatusChanged,
}: CommentsPanelProps) {
  const [draft, setDraft] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const commentsQuery = useQuery(
    orpc.bugReport.listComments.queryOptions({ input: { bugReportId } })
  )

  const addMutation = useMutation({
    mutationFn: (setStatus?: BugReportStatus) =>
      client.bugReport.addComment({ bugReportId, body: draft, setStatus }),
    onSuccess: async (result, setStatus) => {
      setDraft("")
      await commentsQuery.refetch()
      if (setStatus) {
        await onStatusChanged()
        toast.success(
          `Comment added. Moved to ${formatStatusLabel(result.status)}`
        )
      }
    },
    onError: (error) => toast.error(error.message || "Failed to add comment"),
  })

  const editMutation = useMutation({
    mutationFn: (id: string) =>
      client.bugReport.editComment({ id, body: editDraft }),
    onSuccess: async () => {
      setEditingId(null)
      await commentsQuery.refetch()
    },
    onError: (error) => toast.error(error.message || "Failed to edit comment"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.bugReport.deleteComment({ id }),
    onSuccess: async () => {
      setDeleteId(null)
      await commentsQuery.refetch()
    },
    onError: (error) =>
      toast.error(error.message || "Failed to delete comment"),
  })

  const comments = commentsQuery.data ?? []
  const canSubmit = draft.trim().length > 0 && !addMutation.isPending

  return (
    <div className="flex h-full flex-col">
      <ConfirmationDialog
        confirmText="Delete comment"
        description="This comment will be removed for everyone."
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId)
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        open={deleteId !== null}
        title="Delete this comment?"
        variant="destructive"
      />
      <div className="flex-1 space-y-4 p-4">
        {commentsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground text-sm">
            <MessageSquare className="h-6 w-6" />
            <p>No comments yet.</p>
            <p className="text-xs">
              Add details, or reply once a fix is ready for review.
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <article className="space-y-1.5" key={comment.id}>
              <header className="flex items-baseline justify-between gap-2">
                <p className="truncate font-medium text-sm">
                  {comment.author?.name ?? "Former member"}
                  <span className="ml-2 font-normal text-muted-foreground text-xs">
                    {formatWhen(comment.createdAt)}
                    {comment.edited ? " · edited" : ""}
                  </span>
                </p>
                {comment.isMine && editingId !== comment.id ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      aria-label="Edit comment"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setEditingId(comment.id)
                        setEditDraft(comment.body)
                      }}
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Delete comment"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        setDeleteId(comment.id)
                      }}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </header>

              {comment.statusChange ? (
                <p className="flex items-center gap-1 text-muted-foreground text-xs">
                  <ArrowRight className="h-3 w-3" />
                  Moved to{" "}
                  <span className="font-semibold text-foreground">
                    {formatStatusLabel(comment.statusChange)}
                  </span>
                </p>
              ) : null}

              {editingId === comment.id ? (
                <div className="space-y-2">
                  <Textarea
                    maxLength={COMMENT_MAX_LENGTH}
                    onChange={(event) => setEditDraft(event.target.value)}
                    rows={3}
                    value={editDraft}
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={!editDraft.trim() || editMutation.isPending}
                      onClick={() => editMutation.mutate(comment.id)}
                      size="sm"
                    >
                      Save
                    </Button>
                    <Button
                      onClick={() => setEditingId(null)}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-sm leading-relaxed">
                  {comment.body}
                </p>
              )}
            </article>
          ))
        )}
      </div>

      <form
        className="sticky bottom-0 space-y-2 border-t bg-background p-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) addMutation.mutate(undefined)
        }}
      >
        <Textarea
          aria-label="Add a comment"
          className="max-h-48"
          maxLength={COMMENT_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              canSubmit
            ) {
              event.preventDefault()
              addMutation.mutate(undefined)
            }
          }}
          placeholder="Add a comment…"
          rows={3}
          value={draft}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canSubmit} size="sm" type="submit">
            {addMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : null}
            Comment
          </Button>
          {getQuickActions(status).map((action) => (
            <Button
              disabled={!canSubmit}
              key={action.status}
              onClick={() => addMutation.mutate(action.status)}
              size="sm"
              type="button"
              variant="outline"
            >
              {action.label}
            </Button>
          ))}
        </div>
      </form>
    </div>
  )
}

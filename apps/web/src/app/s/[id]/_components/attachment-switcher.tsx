import { cn } from "@crikket/ui/lib/utils"
import { Image as ImageIcon, Video } from "lucide-react"

import type { SharedBugReport } from "./types"

type Attachment = SharedBugReport["attachments"][number]

/**
 * Tabs for reports with more than one attachment (AfricanBooks fork).
 * Attachment 1 is the original capture; the console/network timeline belongs to it.
 */
export function AttachmentSwitcher({
  attachments,
  selectedIndex,
  onSelect,
}: {
  attachments: Attachment[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  if (attachments.length < 2) {
    return null
  }

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t bg-background px-3 py-2">
      <span className="mr-1 shrink-0 text-muted-foreground text-xs">
        {attachments.length} attachments
      </span>
      {attachments.map((attachment, index) => {
        const Icon = attachment.attachmentType === "video" ? Video : ImageIcon
        return (
          <button
            aria-label={`Show attachment ${index + 1}`}
            aria-pressed={index === selectedIndex}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium text-xs transition-colors",
              index === selectedIndex
                ? "border-foreground/30 bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            key={attachment.id}
            onClick={() => onSelect(index)}
            type="button"
          >
            <Icon className="h-3.5 w-3.5" />
            {index + 1}
            <span className="hidden sm:inline">
              · {attachment.attachmentType === "video" ? "Video" : "Screenshot"}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The report as the canvas should render it for the selected attachment. */
export function withSelectedAttachment(
  data: SharedBugReport,
  selectedIndex: number
): SharedBugReport {
  const attachment = data.attachments[selectedIndex]
  if (!attachment || selectedIndex === 0) {
    return data
  }

  return {
    ...data,
    attachmentType: attachment.attachmentType,
    attachmentUrl: attachment.url,
    metadata:
      attachment.durationMs === null
        ? null
        : { durationMs: attachment.durationMs },
  }
}

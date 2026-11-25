import { MAX_MEDIA_PER_REPORT } from "../../../constants"
import type { CaptureSubmissionDraft } from "../../../types"
import type {
  CaptureReviewSubmitOptions,
  CaptureUiHandlers,
  CaptureUiState,
} from "../../types"
import { MediaPreview } from "../components/media-preview"
import { Button } from "../components/primitives/button"
import { Field, FieldError } from "../components/primitives/field"
import { Input } from "../components/primitives/input"
import { Label } from "../components/primitives/label"
import { Textarea } from "../components/primitives/textarea"
import { ScreenshotAnnotationEditor } from "../components/screenshot-annotation-editor"
import { SummaryStat } from "../components/summary-stat"
import { useReviewForm } from "../hooks/use-review-form"
import { capturePriorityOptions } from "../utils/review-form-schema"
import {
  createAnnotatedScreenshotBlob,
  type ScreenshotAnnotation,
} from "../utils/screenshot-annotations"

interface ReviewFormSectionProps {
  formKey: string
  isSubmitting: boolean
  state: CaptureUiState
  handlers: Pick<
    CaptureUiHandlers,
    "onAddMore" | "onSelectMedia" | "onRemoveMedia" | "onAnnotationsChange"
  >
  onCancel: () => void
  onSubmit: (
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) => Promise<void>
}

export function ReviewFormSection({
  formKey,
  isSubmitting,
  state,
  handlers,
  onCancel,
  onSubmit,
}: ReviewFormSectionProps): React.JSX.Element {
  // Annotations live in the store, per screenshot, so they survive switching
  // between attachments and adding new ones.
  const annotations: ScreenshotAnnotation[] = state.media
    ? (state.annotationsByUrl[state.media.objectUrl] ?? [])
    : []
  const setAnnotations = (next: ScreenshotAnnotation[]) => {
    if (state.media) {
      handlers.onAnnotationsChange(state.media.objectUrl, next)
    }
  }
  const canAddMore = state.mediaItems.length < MAX_MEDIA_PER_REPORT

  const form = useReviewForm({
    initialDraft: state.reviewDraft,
    onSubmit: async (draft) => {
      const submitOptions: CaptureReviewSubmitOptions = {}
      const overrides: Record<string, Blob> = {}

      for (const [index, item] of state.mediaItems.entries()) {
        const itemAnnotations = state.annotationsByUrl[item.objectUrl] ?? []
        if (item.captureType !== "screenshot" || itemAnnotations.length === 0) {
          continue
        }
        const annotated = await createAnnotatedScreenshotBlob({
          annotations: itemAnnotations,
          imageUrl: item.objectUrl,
        })
        if (!annotated) {
          continue
        }
        if (index === 0) {
          submitOptions.screenshotBlobOverride = annotated
        } else {
          overrides[item.objectUrl] = annotated
        }
      }
      if (Object.keys(overrides).length > 0) {
        submitOptions.screenshotBlobOverrides = overrides
      }

      onSubmit(draft, submitOptions)
    },
  })

  return (
    <section
      className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(0,1.5fr)_360px]"
      key={formKey}
    >
      <div className="flex min-h-[320px] min-w-0 flex-col border-b bg-muted/20 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="font-medium text-sm">Review capture</p>
            <p className="text-muted-foreground text-xs">
              {state.media?.captureType === "screenshot"
                ? "Annotate the screenshot before submitting."
                : "Preview the recording before submitting."}
            </p>
          </div>
        </div>

        <MediaStrip
          activeIndex={state.activeMediaIndex}
          canAddMore={canAddMore}
          disabled={state.busy || isSubmitting}
          items={state.mediaItems}
          onAdd={() => handlers.onAddMore(form.draft)}
          onRemove={handlers.onRemoveMedia}
          onSelect={handlers.onSelectMedia}
        />

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {state.media?.captureType === "screenshot" ? (
            <ScreenshotAnnotationEditor
              annotations={annotations}
              disabled={state.busy || isSubmitting}
              onChange={setAnnotations}
              src={state.media.objectUrl}
            />
          ) : (
            <div className="flex min-h-full items-center justify-center">
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-black">
                <MediaPreview media={state.media} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto p-5">
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            <SummaryStat label="Actions" value={state.summary.actions} />
            <SummaryStat label="Logs" value={state.summary.logs} />
            <SummaryStat
              label="Network"
              value={state.summary.networkRequests}
            />
          </div>

          {state.warnings.length > 0 ? (
            <ul className="m-0 grid gap-1 rounded-lg border bg-muted/40 px-4 py-3 pl-8 text-muted-foreground text-xs">
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <form className="grid gap-4" onSubmit={form.handleSubmit}>
            <Field data-invalid={Boolean(form.visibleErrors.title)}>
              <Label htmlFor={`${formKey}-title`}>Title</Label>
              <Input
                aria-invalid={Boolean(form.visibleErrors.title)}
                id={`${formKey}-title`}
                maxLength={200}
                onBlur={() => {
                  form.touchField("title")
                }}
                onChange={(event) => {
                  form.setFieldValue("title", event.currentTarget.value)
                }}
                placeholder="Enter a title (optional)"
                value={form.draft.title}
              />
              {form.visibleErrors.title ? (
                <FieldError errors={[form.visibleErrors.title]} />
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.visibleErrors.description)}>
              <Label htmlFor={`${formKey}-description`}>Description</Label>
              <Textarea
                aria-invalid={Boolean(form.visibleErrors.description)}
                className="min-h-32 resize-y"
                id={`${formKey}-description`}
                maxLength={4000}
                onBlur={() => {
                  form.touchField("description")
                }}
                onChange={(event) => {
                  form.setFieldValue("description", event.currentTarget.value)
                }}
                placeholder="Enter a description (optional)"
                value={form.draft.description}
              />
              {form.visibleErrors.description ? (
                <FieldError errors={[form.visibleErrors.description]} />
              ) : null}
            </Field>

            <Field data-invalid={Boolean(form.visibleErrors.priority)}>
              <Label htmlFor={`${formKey}-priority`}>Priority</Label>
              <select
                aria-invalid={Boolean(form.visibleErrors.priority)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60"
                id={`${formKey}-priority`}
                onBlur={() => {
                  form.touchField("priority")
                }}
                onChange={(event) => {
                  form.setFieldValue(
                    "priority",
                    event.currentTarget
                      .value as CaptureSubmissionDraft["priority"]
                  )
                }}
                value={form.draft.priority}
              >
                {capturePriorityOptions.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
              {form.visibleErrors.priority ? (
                <FieldError errors={[form.visibleErrors.priority]} />
              ) : null}
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="w-full"
                disabled={state.busy || isSubmitting}
                type="submit"
              >
                Submit Report
              </Button>
              <Button
                className="w-full"
                disabled={state.busy || isSubmitting}
                onClick={onCancel}
                type="button"
                variant="outline"
              >
                Start Over
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

function MediaStrip(props: {
  items: CaptureUiState["mediaItems"]
  activeIndex: number
  canAddMore: boolean
  disabled: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onAdd: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b px-5 py-3">
      {props.items.map((item, index) => (
        <div className="relative shrink-0" key={item.objectUrl}>
          <button
            aria-label={`Show attachment ${index + 1}`}
            aria-pressed={index === props.activeIndex}
            className={`block h-12 w-16 overflow-hidden rounded-md bg-black ${
              index === props.activeIndex
                ? "text-foreground"
                : "opacity-60 hover:opacity-100"
            }`}
            onClick={() => props.onSelect(index)}
            style={
              index === props.activeIndex
                ? { outline: "2px solid currentColor", outlineOffset: 2 }
                : undefined
            }
            type="button"
          >
            {item.captureType === "screenshot" ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                src={item.objectUrl}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] text-white">
                Video
              </span>
            )}
          </button>
          {props.items.length > 1 ? (
            <button
              aria-label={`Remove attachment ${index + 1}`}
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-[11px] leading-none shadow-sm"
              disabled={props.disabled}
              onClick={() => props.onRemove(index)}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      {props.canAddMore ? (
        <Button
          className="h-12 shrink-0 px-3"
          disabled={props.disabled}
          onClick={props.onAdd}
          type="button"
          variant="outline"
        >
          + Add
        </Button>
      ) : null}
      <span className="ml-auto shrink-0 text-muted-foreground text-xs">
        {props.items.length}/{MAX_MEDIA_PER_REPORT}
      </span>
    </div>
  )
}

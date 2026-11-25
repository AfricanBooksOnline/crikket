import type {
  CaptureDebuggerSummary,
  CapturedMedia,
  CaptureSubmissionDraft,
} from "../types"
import type { ScreenshotAnnotation } from "./capture-widget/utils/screenshot-annotations"

export interface CaptureReviewSubmitOptions {
  screenshotBlobOverride?: Blob
  /** Annotated versions of extra screenshots, keyed by their objectUrl. */
  screenshotBlobOverrides?: Record<string, Blob>
}

export interface CaptureUiState {
  view: "chooser" | "recording" | "review" | "success"
  overlayOpen: boolean
  recordingDockOpen: boolean
  busy: boolean
  errorMessage: string | null
  recordingStartedAt: number | null
  warnings: string[]
  summary: CaptureDebuggerSummary
  /** The attachment currently shown in the review screen. */
  media: CapturedMedia | null
  /** All attachments, first one first (AfricanBooks fork). */
  mediaItems: CapturedMedia[]
  activeMediaIndex: number
  /** True while the chooser is open to add another attachment. */
  addingMore: boolean
  annotationsByUrl: Record<string, ScreenshotAnnotation[]>
  shareUrl: string
  copyLabel: string
  reviewDraft: CaptureSubmissionDraft
  reviewFormKey: string
}

export interface CaptureUiHandlers {
  onLauncherClick: () => void
  onClose: () => void
  onStartVideo: () => void
  onTakeScreenshot: () => void
  onAttachImage: (file: File) => void
  onStopRecording: () => void
  onAddMore: (draft: CaptureSubmissionDraft) => void
  onBackToReview: () => void
  onSelectMedia: (index: number) => void
  onRemoveMedia: (index: number) => void
  onAnnotationsChange: (
    objectUrl: string,
    annotations: ScreenshotAnnotation[]
  ) => void
  onSubmit: (
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) => Promise<void>
  onCancel: () => void
  onRetry: () => void
  onCopyLink: () => void
  onOpenLink: () => void
}

export interface CaptureUiCallbacks {
  onClose: () => void
  onStartVideo: () => Promise<{ startedAt: number }>
  onTakeScreenshot: () => Promise<void>
  onAttachImage: (file: File) => Promise<void>
  onStopRecording: () => Promise<void>
  onBeginAddMore: () => void
  onCancelAddMore: () => void
  onRemoveMedia: (index: number) => void
  onSubmit: (
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) => Promise<void>
  onReset: () => void
}

export interface CaptureUiStore {
  getSnapshot: () => CaptureUiState
  subscribe: (listener: () => void) => () => void
  patchState: (patch: Partial<CaptureUiState>) => void
  openChooser: (options?: { addingMore?: boolean }) => void
  close: () => void
  showRecording: (startedAt: number) => void
  showReview: (input: {
    media: CapturedMedia
    warnings: string[]
    summary: CaptureDebuggerSummary
    /** All attachments; defaults to just `media`. */
    mediaItems?: CapturedMedia[]
    /** Keep the typed title/description (adding another attachment). */
    preserveDraft?: boolean
  }) => void
  showSuccess: (shareUrl?: string) => void
  showError: (message: string) => void
  setTitleIfEmpty: (value: string) => void
  destroy: () => void
}

export interface MountedCaptureUi {
  setHidden: (hidden: boolean) => void
  store: CaptureUiStore
  unmount: () => void
}

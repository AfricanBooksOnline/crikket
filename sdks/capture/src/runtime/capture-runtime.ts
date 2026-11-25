import { MAX_MEDIA_PER_REPORT } from "../constants"
import { LazyDebuggerCollector } from "../debugger/lazy-debugger-collector"
import { ATTACH_IMAGE_MAX_BYTES } from "../media/capture-support"
import {
  captureScreenshot,
  startDisplayRecording,
} from "../media/lazy-capture-media"
import type {
  CapturedMedia,
  CaptureInitOptions,
  CaptureRuntimeConfig,
  CaptureRuntimeController,
  CaptureSubmissionDraft,
  CaptureSubmitTransport,
  RecordingController,
  ReviewSnapshot,
} from "../types"
import { mountCaptureUi } from "../ui/mount-capture-ui"
import type { CaptureReviewSubmitOptions, MountedCaptureUi } from "../ui/types"
import {
  normalizeHost,
  normalizeKey,
  normalizeSubmitPath,
  normalizeZIndex,
} from "../utils"

export class CaptureSdkRuntime implements CaptureRuntimeController {
  private runtimeConfig: CaptureRuntimeConfig | null = null
  private submitTransport: CaptureSubmitTransport | undefined
  private mountedTarget: HTMLElement | null = null
  private mountedUi: MountedCaptureUi | null = null
  private readonly debuggerCollector = new LazyDebuggerCollector()
  private activeRecording: RecordingController | null = null
  private currentMedia: CapturedMedia | null = null
  private currentReview: ReviewSnapshot | null = null
  /** Attachments 2..5 (AfricanBooks fork). */
  private extraMedia: CapturedMedia[] = []
  /** Next capture is an extra attachment: keep the debugger session from the first. */
  private addingMore = false

  init(options: CaptureInitOptions): CaptureRuntimeController {
    const config: CaptureRuntimeConfig = {
      key: normalizeKey(options.key),
      host: normalizeHost(options.host),
      submitPath: normalizeSubmitPath(options.submitPath),
      zIndex: normalizeZIndex(options.zIndex),
    }

    this.runtimeConfig = config
    this.submitTransport = options.submitTransport

    if (options.autoMount ?? true) {
      this.mount(options.mountTarget)
    }

    return this
  }

  isInitialized(): boolean {
    return this.runtimeConfig !== null
  }

  getConfig(): CaptureRuntimeConfig | null {
    return this.runtimeConfig
  }

  mount(target?: HTMLElement): void {
    const config = this.getRuntimeConfig()
    this.ensureBrowserContext()

    if (this.mountedTarget) {
      return
    }

    const mountTarget = target ?? document.body
    this.mountedUi = mountCaptureUi(mountTarget, config.zIndex, {
      onClose: () => {
        this.close()
      },
      onStartVideo: () => {
        return this.startRecording()
      },
      onTakeScreenshot: async () => {
        const blob = await this.takeScreenshot()
        if (!blob) {
          throw new Error("Screenshot capture failed.")
        }
      },
      onAttachImage: async (file) => {
        await this.attachImage(file)
      },
      onBeginAddMore: () => {
        if (
          this.currentMedia &&
          this.getAllMedia().length < MAX_MEDIA_PER_REPORT
        ) {
          this.addingMore = true
        }
      },
      onCancelAddMore: () => {
        this.addingMore = false
      },
      onRemoveMedia: (index) => {
        this.removeMedia(index)
      },
      onStopRecording: async () => {
        const blob = await this.stopRecording()
        if (!blob) {
          throw new Error("Recording capture failed.")
        }
      },
      onSubmit: (draft, options) => {
        return this.submit(draft, options).then(() => undefined)
      },
      onReset: () => {
        this.reset()
      },
    })
    this.mountedTarget = mountTarget
  }

  unmount(): void {
    this.abortActiveRecording()
    this.setUiHidden(false)
    this.mountedUi?.unmount()
    this.mountedUi = null
    this.debuggerCollector.dispose()
    this.mountedTarget = null
  }

  open(): void {
    this.getRuntimeConfig()
    if (!this.mountedTarget) {
      this.mount()
    }

    this.mountedUi?.store.openChooser()
  }

  close(): void {
    this.setUiHidden(false)
    this.mountedUi?.store.close()
  }

  destroy(): void {
    this.reset()
    this.unmount()
    this.runtimeConfig = null
    this.submitTransport = undefined
  }

  async startRecording(): Promise<{ startedAt: number }> {
    this.getRuntimeConfig()
    this.ensureBrowserContext()
    this.abortActiveRecording()
    const isExtra = this.addingMore
    if (!isExtra) {
      await this.debuggerCollector.startRecordingSession()
    }

    try {
      await this.hideUiForCapture()
      const controller = await startDisplayRecording()
      if (!isExtra) {
        this.debuggerCollector.markRecordingStarted(controller.startedAt)
      }
      this.activeRecording = controller
      controller.finished
        .then(async (result) => {
          if (this.activeRecording !== controller) {
            return
          }

          this.activeRecording = null
          await this.finalizeCapturedMedia({
            blob: result.blob,
            captureType: "video",
            durationMs: result.durationMs,
          })
        })
        .catch(() => undefined)

      return {
        startedAt: controller.startedAt,
      }
    } catch (error) {
      this.setUiHidden(false)
      if (!isExtra) {
        this.debuggerCollector.clearSession()
      }
      throw error
    }
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.activeRecording) {
      return null
    }

    const recording = this.activeRecording
    this.activeRecording = null

    const result = await recording.stop()
    await this.finalizeCapturedMedia({
      blob: result.blob,
      captureType: "video",
      durationMs: result.durationMs,
    })

    return result.blob
  }

  async takeScreenshot(): Promise<Blob | null> {
    this.getRuntimeConfig()
    this.ensureBrowserContext()
    if (!this.addingMore) {
      await this.debuggerCollector.startScreenshotSession()
    }

    let blob: Blob
    try {
      await this.hideUiForCapture()
      blob = await captureScreenshot()
    } catch (error) {
      this.setUiHidden(false)
      if (!this.addingMore) {
        this.debuggerCollector.clearSession()
      }
      throw error
    }
    await this.finalizeCapturedMedia({
      blob,
      captureType: "screenshot",
      durationMs: null,
    })

    return blob
  }

  /**
   * Use an image the reporter picked from their device instead of a screen
   * capture: for phones and browsers that can't capture (AfricanBooks fork).
   */
  async attachImage(file: Blob): Promise<Blob> {
    this.getRuntimeConfig()
    this.ensureBrowserContext()

    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file (PNG, JPG, …).")
    }

    if (file.size > ATTACH_IMAGE_MAX_BYTES) {
      throw new Error("That image is too large. Please choose one under 15 MB.")
    }

    if (!this.addingMore) {
      await this.debuggerCollector.startScreenshotSession()
    }
    this.finalizeCapturedMedia({
      blob: file,
      captureType: "screenshot",
      durationMs: null,
    })

    return file
  }

  async submit(
    draft: CaptureSubmissionDraft,
    options?: CaptureReviewSubmitOptions
  ) {
    const config = this.getRuntimeConfig()
    if (!(this.currentMedia && this.currentReview)) {
      throw new Error(
        "No capture is ready to submit. Start a recording or take a screenshot first."
      )
    }

    const { submitCapturedReport } = await import("./submit-captured-report")
    const media =
      this.currentMedia.captureType === "screenshot" &&
      options?.screenshotBlobOverride
        ? {
            ...this.currentMedia,
            blob: options.screenshotBlobOverride,
          }
        : this.currentMedia
    const extraMedia = this.extraMedia.map((item) => ({
      blob:
        item.captureType === "screenshot"
          ? (options?.screenshotBlobOverrides?.[item.objectUrl] ?? item.blob)
          : item.blob,
      captureType: item.captureType,
      durationMs: item.durationMs,
    }))
    const result = await submitCapturedReport({
      config,
      draft,
      media,
      extraMedia,
      review: this.currentReview,
      submitTransport: this.submitTransport,
    })

    if (this.mountedUi) {
      this.mountedUi.store.showSuccess(result.shareUrl)
    }

    return result
  }

  reset(): void {
    this.abortActiveRecording()
    this.setUiHidden(false)
    this.clearMedia()
    for (const item of this.extraMedia) {
      URL.revokeObjectURL(item.objectUrl)
    }
    this.extraMedia = []
    this.addingMore = false
    this.currentReview = null
    this.debuggerCollector.clearSession()
  }

  private setMedia(input: {
    blob: Blob
    captureType: CapturedMedia["captureType"]
    durationMs: number | null
  }): CapturedMedia {
    this.clearMedia()

    this.currentMedia = {
      blob: input.blob,
      captureType: input.captureType,
      durationMs: input.durationMs,
      objectUrl: URL.createObjectURL(input.blob),
    }

    return this.currentMedia
  }

  private clearMedia(): void {
    if (!this.currentMedia) {
      return
    }

    URL.revokeObjectURL(this.currentMedia.objectUrl)
    this.currentMedia = null
  }

  private finalizeCapturedMedia(input: {
    blob: Blob
    captureType: CapturedMedia["captureType"]
    durationMs: number | null
  }): void {
    this.setUiHidden(false)

    if (this.addingMore && this.currentMedia && this.currentReview) {
      this.addingMore = false
      const media: CapturedMedia = {
        blob: input.blob,
        captureType: input.captureType,
        durationMs: input.durationMs,
        objectUrl: URL.createObjectURL(input.blob),
      }
      this.extraMedia.push(media)
      this.mountedUi?.store.showReview({
        media,
        mediaItems: this.getAllMedia(),
        warnings: this.currentReview.warnings,
        summary: this.currentReview.debuggerSummary,
        preserveDraft: true,
      })
      return
    }

    const review = this.debuggerCollector.finalizeSession()
    const media = this.setMedia(input)

    this.currentReview = review
    if (!this.mountedUi) {
      return
    }

    this.mountedUi.store.showReview({
      media,
      warnings: review.warnings,
      summary: review.debuggerSummary,
    })
    this.prefillTitle()
  }

  private getAllMedia(): CapturedMedia[] {
    return this.currentMedia ? [this.currentMedia, ...this.extraMedia] : []
  }

  /** Drop one attachment; removing the first promotes the next one. */
  private removeMedia(index: number): void {
    const all = this.getAllMedia()
    const removed = all[index]
    if (!removed) {
      return
    }

    URL.revokeObjectURL(removed.objectUrl)
    const remaining = all.filter((_, i) => i !== index)
    this.currentMedia = remaining[0] ?? null
    this.extraMedia = remaining.slice(1)

    const store = this.mountedUi?.store
    if (!store) {
      return
    }

    if (!this.currentMedia) {
      this.reset()
      store.openChooser()
      return
    }

    const state = store.getSnapshot()
    const nextIndex = Math.min(index, remaining.length - 1)
    store.showReview({
      media: remaining[nextIndex] ?? this.currentMedia,
      mediaItems: remaining,
      warnings: state.warnings,
      summary: state.summary,
      preserveDraft: true,
    })
  }

  private abortActiveRecording(): void {
    if (!this.activeRecording) {
      return
    }

    this.activeRecording.abort()
    this.activeRecording = null
  }

  private async hideUiForCapture(): Promise<void> {
    this.setUiHidden(true)
    await waitForNextPaint()
  }

  private setUiHidden(hidden: boolean): void {
    this.mountedUi?.setHidden(hidden)
  }

  private prefillTitle(): void {
    const captureTitle = document.title.trim()
    if (captureTitle.length === 0) {
      return
    }

    this.mountedUi?.store.setTitleIfEmpty(captureTitle)
  }

  private getRuntimeConfig(): CaptureRuntimeConfig {
    if (!this.runtimeConfig) {
      throw new Error(
        "Capture SDK is not initialized. Call capture.init({ key }) first."
      )
    }

    return this.runtimeConfig
  }

  private ensureBrowserContext(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("Capture SDK can only run in a browser environment.")
    }
  }
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}

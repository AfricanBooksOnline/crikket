import { z } from "zod"

const bugReportArtifactKindValues = [
  "capture",
  "thumbnail",
  "debugger",
] as const

export const bugReportArtifactKindSchema = z.enum(bugReportArtifactKindValues)

export type BugReportArtifactKind = z.infer<typeof bugReportArtifactKindSchema>

export function buildCaptureArtifactKey(input: {
  organizationId: string
  bugReportId: string
  captureType: "video" | "screenshot"
}): string {
  return (
    buildBugReportArtifactBasePath(input) +
    getCaptureFilename(input.captureType)
  )
}

/** Key for attachment 2..5 (AfricanBooks fork), next to the primary capture. */
export function buildExtraAttachmentArtifactKey(input: {
  organizationId: string
  bugReportId: string
  position: number
  captureType: "video" | "screenshot"
}): string {
  const extension = input.captureType === "video" ? "webm" : "png"
  return (
    buildBugReportArtifactBasePath(input) +
    `attachment-${input.position}.${extension}`
  )
}

export function buildThumbnailArtifactKey(input: {
  organizationId: string
  bugReportId: string
}): string {
  return `${buildBugReportArtifactBasePath(input)}thumbnail.png`
}

export function buildDebuggerArtifactKey(input: {
  organizationId: string
  bugReportId: string
}): string {
  const basePath = buildBugReportBasePath(input)
  return `${basePath}/debugger/payload.json.gz`
}

function buildBugReportArtifactBasePath(input: {
  organizationId: string
  bugReportId: string
}): string {
  const basePath = buildBugReportBasePath(input)
  return `${basePath}/capture/`
}

function buildBugReportBasePath(input: {
  organizationId: string
  bugReportId: string
}): string {
  return `organizations/${input.organizationId}/bug-reports/${input.bugReportId}`
}

function getCaptureFilename(captureType: "video" | "screenshot"): string {
  return captureType === "video" ? "video.webm" : "screenshot.png"
}

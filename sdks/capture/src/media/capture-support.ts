/**
 * Browser capability checks for screen capture (AfricanBooks fork).
 *
 * Kept dependency-free so the widget UI can import it without pulling in
 * the lazily-loaded capture code.
 */

export const ATTACH_IMAGE_MAX_BYTES = 15 * 1024 * 1024

export const CAPTURE_BLOCKED_MESSAGE =
  "Screen capture isn't available here. Attach an image of the problem instead."

const CHROMIUM_BRAND_PATTERN = /chrom/i
const POLICY_ERROR_PATTERN = /permissions policy|feature policy/i

interface FeaturePolicyLike {
  allowsFeature?: (feature: string) => boolean
}

interface NavigatorWithUaData extends Navigator {
  userAgentData?: { brands?: Array<{ brand: string }> }
}

/**
 * Whether this page can call getDisplayMedia at all. False on phones, in
 * old browsers, and inside iframes whose parent didn't grant display-capture.
 */
export function isDisplayCaptureAvailable(): boolean {
  if (typeof navigator === "undefined") {
    return false
  }

  if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
    return false
  }

  // Chromium exposes the iframe permissions policy; other engines don't.
  const policy = (document as Document & { featurePolicy?: FeaturePolicyLike })
    .featurePolicy
  if (policy?.allowsFeature && !policy.allowsFeature("display-capture")) {
    return false
  }

  return true
}

/**
 * Chromium browsers (Chrome, Edge, Brave, Opera) can share a single tab, so
 * we insist on the tab there. Safari and Firefox can only share a window or
 * the whole screen, so we accept those instead of failing.
 */
export function supportsTabCapture(): boolean {
  if (typeof navigator === "undefined") {
    return false
  }

  const brands = (navigator as NavigatorWithUaData).userAgentData?.brands
  if (brands?.some((entry) => CHROMIUM_BRAND_PATTERN.test(entry.brand))) {
    return true
  }

  return typeof window !== "undefined" && "CropTarget" in window
}

export function isPermissionsPolicyError(error: unknown): boolean {
  return error instanceof Error && POLICY_ERROR_PATTERN.test(error.message)
}

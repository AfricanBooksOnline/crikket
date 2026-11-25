import { useRef } from "react"
import { isDisplayCaptureAvailable } from "../../../media/capture-support"
import { Button } from "../components/primitives/button"

export function ChooserSection(props: {
  busy: boolean
  /** Shown while adding another attachment: returns to the review screen. */
  onBack?: () => void
  onAttachImage: (file: File) => void
  onStartVideo: () => void
  onTakeScreenshot: () => void
}): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Phones, some browsers and blocked iframes can't capture the screen.
  const canCapture = isDisplayCaptureAvailable()

  const fileInput = (
    <input
      accept="image/*"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (file) {
          props.onAttachImage(file)
        }
      }}
      ref={fileInputRef}
      style={{ display: "none" }}
      type="file"
    />
  )
  const openFilePicker = () => fileInputRef.current?.click()
  const backButton = props.onBack ? (
    <Button
      className="w-full"
      disabled={props.busy}
      onClick={props.onBack}
      type="button"
      variant="outline"
    >
      Back to review
    </Button>
  ) : null

  if (!canCapture) {
    return (
      <section className="grid gap-4 p-5">
        <p className="m-0 text-muted-foreground text-sm">
          Screen capture isn't available here. Take a screenshot on your device,
          then attach it.
        </p>
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={openFilePicker}
          type="button"
        >
          Attach image
        </Button>
        {backButton}
        {fileInput}
      </section>
    )
  }

  return (
    <section className="grid gap-4 p-5">
      <p className="m-0 text-muted-foreground text-sm">
        {props.onBack
          ? "Add another screenshot, recording or image to this report."
          : "Choose how to capture the issue."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={props.onStartVideo}
          type="button"
        >
          Record Video
        </Button>
        <Button
          className="w-full"
          disabled={props.busy}
          onClick={props.onTakeScreenshot}
          type="button"
          variant="outline"
        >
          Take Screenshot
        </Button>
      </div>
      <Button
        className="w-full"
        disabled={props.busy}
        onClick={openFilePicker}
        type="button"
        variant="secondary"
      >
        Or attach an image
      </Button>
      {backButton}
      {fileInput}
    </section>
  )
}

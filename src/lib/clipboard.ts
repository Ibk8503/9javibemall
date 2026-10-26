import { toast } from "sonner";

/**
 * Copies text to the clipboard with a legacy fallback.
 *
 * `navigator.clipboard` is only available in secure, focused, top-level
 * contexts, so it can silently fail inside preview iframes or when the
 * document has lost focus. This helper falls back to a hidden textarea +
 * `document.execCommand("copy")` and reports failures instead of pretending
 * the copy succeeded.
 */
export async function copyText(value: string, label?: string): Promise<boolean> {
  const successMessage = label ? `${label} copied to clipboard!` : "Copied to clipboard!";
  const failureMessage = "Couldn't copy to clipboard. Select the text and copy it manually.";

  const legacyCopy = (): boolean => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      const selection = document.getSelection();
      const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      textarea.select();
      textarea.setSelectionRange(0, value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (previousRange && selection) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      }
      return ok;
    } catch {
      return false;
    }
  };

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }

  if (legacyCopy()) {
    toast.success(successMessage);
    return true;
  }

  toast.error(failureMessage);
  return false;
}

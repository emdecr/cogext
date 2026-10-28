// ============================================================================
// HOOK TESTS — usePreventWindowFileDrop
// ============================================================================
//
// Protects the "near-miss" guard used by the image dropzones: a file dropped
// outside the dropzone must not fall through to the browser default (which
// navigates away and loses the unsaved form).
//
// jsdom has no DragEvent/DataTransfer, so we dispatch a plain cancelable
// Event and attach a minimal dataTransfer. defaultPrevented tells us whether
// the hook's window listener swallowed it.
// ============================================================================

import { renderHook } from "@testing-library/react";
import { usePreventWindowFileDrop } from "@/hooks/use-prevent-window-file-drop";

function dispatchDrag(type: "dragover" | "drop", types: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types } });
  window.dispatchEvent(event);
  return event;
}

describe("usePreventWindowFileDrop", () => {
  it("prevents the default for file dragover and drop", () => {
    renderHook(() => usePreventWindowFileDrop());

    expect(dispatchDrag("dragover", ["Files"]).defaultPrevented).toBe(true);
    expect(dispatchDrag("drop", ["Files"]).defaultPrevented).toBe(true);
  });

  it("leaves non-file drags alone (e.g. in-page reordering)", () => {
    renderHook(() => usePreventWindowFileDrop());

    expect(dispatchDrag("dragover", ["text/plain"]).defaultPrevented).toBe(
      false,
    );
    expect(dispatchDrag("drop", ["text/plain"]).defaultPrevented).toBe(false);
  });

  it("does nothing while disabled", () => {
    renderHook(() => usePreventWindowFileDrop(false));

    expect(dispatchDrag("drop", ["Files"]).defaultPrevented).toBe(false);
  });

  it("starts and stops guarding as enabled toggles", () => {
    const { rerender } = renderHook(
      ({ enabled }) => usePreventWindowFileDrop(enabled),
      { initialProps: { enabled: false } },
    );
    expect(dispatchDrag("drop", ["Files"]).defaultPrevented).toBe(false);

    rerender({ enabled: true });
    expect(dispatchDrag("drop", ["Files"]).defaultPrevented).toBe(true);

    rerender({ enabled: false });
    expect(dispatchDrag("drop", ["Files"]).defaultPrevented).toBe(false);
  });

  it("removes its listeners on unmount", () => {
    const { unmount } = renderHook(() => usePreventWindowFileDrop());
    unmount();

    expect(dispatchDrag("drop", ["Files"]).defaultPrevented).toBe(false);
  });
});

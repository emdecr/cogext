// ============================================================================
// COMPONENT TESTS — MarkdownField
// ============================================================================
//
// MarkdownField is the seam between the plain textarea and the WYSIWYG dialog.
// We test its own logic:
//   - renders the textarea with the given value + label
//   - typing routes through onChange
//   - the "Open editor" button opens the dialog
//   - saving in the dialog flows markdown back through onChange
//
// We mock RichTextDialog: the real one lazy-loads the whole Tiptap engine via
// next/dynamic, which is heavy and irrelevant to MarkdownField's wiring. The
// stub lets us assert MarkdownField opens it and forwards onSave → onChange.
// The editor's own markdown behavior is covered by rich-text-extensions.test.ts.
// ============================================================================

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import MarkdownField from "@/components/markdown-field";

// ---- Mock the heavy dialog ----
vi.mock("@/components/rich-text-dialog", () => ({
  default: ({
    open,
    title,
    value,
    onSave,
  }: {
    open: boolean;
    title: string;
    value: string;
    onSave: (v: string) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <span data-testid="dialog-value">{value}</span>
        <button type="button" onClick={() => onSave("edited in dialog")}>
          mock-save
        </button>
      </div>
    ) : null,
}));

// A stateful harness so the controlled textarea actually updates as we type.
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownField
      id="test-field"
      label="Content"
      value={value}
      onChange={setValue}
      dialogTitle="Edit content"
    />
  );
}

describe("MarkdownField", () => {
  it("renders a textarea with the label and value", () => {
    render(<Harness initial="hello world" />);
    const textarea = screen.getByLabelText("Content");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("hello world");
  });

  it("routes typing through onChange", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const textarea = screen.getByLabelText("Content");
    await user.type(textarea, "typed text");
    expect(textarea).toHaveValue("typed text");
  });

  it("opens the dialog when 'Open editor' is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness initial="seed markdown" />);

    // Dialog is not present until opened.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open editor/i }));

    const dialog = screen.getByRole("dialog", { name: "Edit content" });
    expect(dialog).toBeInTheDocument();
    // The dialog is seeded with the field's current value.
    expect(screen.getByTestId("dialog-value")).toHaveTextContent("seed markdown");
  });

  it("flows the dialog's saved markdown back into the field", async () => {
    const user = userEvent.setup();
    render(<Harness initial="before" />);

    await user.click(screen.getByRole("button", { name: /open editor/i }));
    await user.click(screen.getByRole("button", { name: "mock-save" }));

    expect(screen.getByLabelText("Content")).toHaveValue("edited in dialog");
  });
});

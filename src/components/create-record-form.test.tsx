// ============================================================================
// COMPONENT TESTS — CreateRecordForm
// ============================================================================
//
// We test this component because it has real logic worth protecting:
//   - Record type switching (shows/hides different fields)
//   - File selection and preview
//   - Submit button disabled state (image type without a file)
//   - Server action error handling
//   - Field-level validation errors from the server
//   - Form reset on success
//
// WHAT WE'RE NOT TESTING:
//   - Tailwind CSS styles (automated tests can't verify design intent)
//   - Radix UI behavior (Radix tests it themselves)
//   - That createRecord ACTUALLY saves to the database (integration/E2E job)
//
// KEY TECHNIQUE: mocking Server Actions
//   createRecord and addTagToRecord are Server Actions — they run on the
//   server and connect to the database. In a test environment, they can't
//   actually run. We mock the entire module so the component gets a
//   controllable function instead.
//
//   vi.mock() is hoisted to before any imports. This means even though the
//   component file imports createRecord at the top, it gets our mock.
//
// KEY TECHNIQUE: @testing-library/user-event
//   userEvent simulates real browser interactions more accurately than
//   fireEvent. It fires mousedown → mouseup → click in sequence (like a
//   real browser), rather than just dispatching a synthetic event.
//   Always prefer userEvent for clicks and typing.
//
// KEY TECHNIQUE: queries by role and label
//   React Testing Library's queryByRole, getByLabelText, getByRole
//   mirror what assistive technology (screen readers) sees. If the test
//   can find a button by its accessible name, a screen reader can too —
//   your tests double as accessibility checks.
// ============================================================================

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  mockCreateRecord,
  mockAddTagToRecord,
  resetActionMocks,
} from "@/test/mocks/actions";

// ---- Mock Server Actions ----
// These MUST be mocked before the component is imported.
// Vitest hoists vi.mock() calls automatically, but it's good practice
// to put them near the top for readability.
vi.mock("@/lib/actions/records", () => ({
  createRecord: mockCreateRecord,
}));

vi.mock("@/lib/actions/tags", () => ({
  addTagToRecord: mockAddTagToRecord,
}));

// ---- Mock the TagInput component ----
// We're testing CreateRecordForm, not TagInput. Mocking TagInput keeps
// the tests focused and avoids importing TagInput's own dependencies.
vi.mock("@/components/tag-input", () => ({
  default: () => <div data-testid="tag-input" />,
}));

// ---- Import AFTER mocks ----
import CreateRecordForm from "@/components/create-record-form";

// ---- Setup: mock browser APIs not in jsdom ----
// jsdom doesn't implement URL.createObjectURL (it requires a real browser
// Blob storage implementation). We provide a simple stub.
beforeAll(() => {
  URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-preview-url");
  URL.revokeObjectURL = vi.fn();
});

// ---- Reset mocks between tests ----
beforeEach(() => {
  resetActionMocks();
});

// ============================================================================
// HELPERS
// ============================================================================

// Render the form and open it by clicking the "+" button.
// Almost every test needs to do this, so we extract it.
async function renderAndOpenForm() {
  const user = userEvent.setup();
  render(<CreateRecordForm />);

  // The form starts closed — only a "+" button is shown
  const openButton = screen.getByRole("button", { name: "Create new record" });
  await user.click(openButton);

  return user;
}

// ============================================================================
// TESTS: initial state
// ============================================================================

describe("CreateRecordForm", () => {
  describe("closed state", () => {
    it("renders a button to open the form", () => {
      render(<CreateRecordForm />);

      // Using getByRole ensures the button has the correct accessible name —
      // good for both tests and screen reader users
      expect(
        screen.getByRole("button", { name: "Create new record" })
      ).toBeInTheDocument();
    });

    it("does not render the form when closed", () => {
      render(<CreateRecordForm />);

      expect(screen.queryByText("New Record")).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // TESTS: opening the form
  // ============================================================================

  describe("opening the form", () => {
    it("shows the form after clicking the open button", async () => {
      await renderAndOpenForm();

      expect(screen.getByText("New Record")).toBeInTheDocument();
    });

    it("closes the form when the × button is clicked", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "Close form" }));

      expect(screen.queryByText("New Record")).not.toBeInTheDocument();
    });

    it("closes the form when Cancel is clicked", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("New Record")).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // TESTS: record type selection
  // ============================================================================

  describe("record type selection", () => {
    it("defaults to 'note' type", async () => {
      await renderAndOpenForm();

      // The "note" button should appear selected (active state).
      // We detect this via aria or text — not CSS classes.
      // Since the form renders type buttons, we check that
      // note-specific UI is present (no file upload for notes).
      expect(screen.queryByText("Click to select an image")).not.toBeInTheDocument();
    });

    it("shows image upload area when 'image' type is selected", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "image" }));

      expect(
        screen.getByText("Click to select an image")
      ).toBeInTheDocument();
    });

    it("hides image upload area when switching back to 'note'", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "image" }));
      await user.click(screen.getByRole("button", { name: "note" }));

      expect(
        screen.queryByText("Click to select an image")
      ).not.toBeInTheDocument();
    });

    it("labels content field as 'Description (optional)' for image type", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "image" }));

      // The label text changes based on type — test that it changes correctly
      expect(screen.getByText("Description")).toBeInTheDocument();
    });

    it("shows Source URL field for link type", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "link" }));

      expect(screen.getByLabelText("Source URL")).toBeInTheDocument();
    });

    it("hides Source URL field for note type", async () => {
      await renderAndOpenForm();

      // note is the default — Source URL should not be present
      expect(screen.queryByLabelText("Source URL")).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // TESTS: submit button state
  // ============================================================================

  describe("submit button state", () => {
    it("is enabled by default for note type", async () => {
      await renderAndOpenForm();

      expect(screen.getByRole("button", { name: "Save Record" })).not.toBeDisabled();
    });

    it("is disabled for image type when no file is selected", async () => {
      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "image" }));

      // Image type requires a file — button should be disabled until one is chosen
      expect(screen.getByRole("button", { name: "Save Record" })).toBeDisabled();
    });
  });

  // ============================================================================
  // TESTS: successful submission
  // ============================================================================

  describe("successful submission", () => {
    it("calls createRecord with the form data", async () => {
      const user = await renderAndOpenForm();

      await user.type(screen.getByLabelText(/title/i), "My Test Note");
      await user.type(screen.getByLabelText(/content/i), "This is the content");
      await user.click(screen.getByRole("button", { name: "Save Record" }));

      await waitFor(() => {
        expect(mockCreateRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "note",
            title: "My Test Note",
            content: "This is the content",
          })
        );
      });
    });

    it("closes the form after successful submission", async () => {
      const user = await renderAndOpenForm();

      await user.type(screen.getByLabelText(/content/i), "Some content");
      await user.click(screen.getByRole("button", { name: "Save Record" }));

      await waitFor(() => {
        expect(screen.queryByText("New Record")).not.toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // TESTS: error handling
  // ============================================================================

  describe("error handling", () => {
    it("shows a general error message when createRecord fails", async () => {
      // Override the default mock return value for this test only.
      // mockResolvedValueOnce reverts to the default after one call.
      mockCreateRecord.mockResolvedValueOnce({
        success: false,
        error: "Something went wrong on the server",
      });

      const user = await renderAndOpenForm();

      await user.type(screen.getByLabelText(/content/i), "Some content");
      await user.click(screen.getByRole("button", { name: "Save Record" }));

      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong on the server")
        ).toBeInTheDocument();
      });

      // The form should stay open — user needs to fix the error
      expect(screen.getByText("New Record")).toBeInTheDocument();
    });

    it("shows field-level errors next to the correct fields", async () => {
      mockCreateRecord.mockResolvedValueOnce({
        success: false,
        error: "Validation failed",
        fieldErrors: {
          content: ["Content is required"],
        },
      });

      const user = await renderAndOpenForm();

      await user.click(screen.getByRole("button", { name: "Save Record" }));

      await waitFor(() => {
        expect(screen.getByText("Content is required")).toBeInTheDocument();
      });
    });

    it("shows error for invalid image file type", async () => {
      const user = await renderAndOpenForm();
      await user.click(screen.getByRole("button", { name: "image" }));

      // Create a fake file with an unsupported type
      const badFile = new File(["content"], "document.pdf", {
        type: "application/pdf",
      });

      // Get the hidden file input and simulate a file selection.
      // We must pass { applyAccept: false } because the <input accept="..."> attribute
      // would normally filter out non-image files in a real browser — and userEvent v14
      // respects that filter by default. Since we're TESTING what happens when an
      // invalid file bypasses that filter (which CAN happen — accept is a UI hint,
      // not a security mechanism), we disable the filter here.
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      await userEvent.upload(fileInput, badFile, { applyAccept: false });

      expect(
        screen.getByText("Please select a JPEG, PNG, GIF, or WebP image")
      ).toBeInTheDocument();
    });
  });
});

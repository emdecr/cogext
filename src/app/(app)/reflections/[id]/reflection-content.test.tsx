// ============================================================================
// COMPONENT TESTS — ReflectionContent
// ============================================================================
//
// This component is worth testing because it conditionally renders a whole
// secondary section: the recommendation cards. The important behavior is:
//   - markdown reflection always renders
//   - recommendations render when present
//   - recommendations section disappears cleanly when empty
// ============================================================================

import { render, screen } from "@testing-library/react";
import ReflectionContent from "./reflection-content";

describe("ReflectionContent", () => {
  it("renders the reflection markdown body", () => {
    render(<ReflectionContent content="**Observed** a return to first principles." recommendations={[]} />);

    expect(screen.getByText("Observed")).toBeInTheDocument();
    expect(screen.getByText(/a return to first principles/i)).toBeInTheDocument();
  });

  it("renders the recommendations section when recommendations exist", () => {
    render(
      <ReflectionContent
        content="A reflective week."
        recommendations={[
          {
            type: "book",
            title: "The Living Mountain",
            creator: "Nan Shepherd",
            year: "1977",
            reason: "It extends the reflection's interest in attention, place, and patient observation.",
          },
        ]}
      />
    );

    expect(
      screen.getByRole("heading", {
        name: /media paths that echo this week's themes/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("The Living Mountain")).toBeInTheDocument();
    expect(screen.getByText(/Nan Shepherd/i)).toBeInTheDocument();
  });

  it("omits the recommendations section when the list is empty", () => {
    render(<ReflectionContent content="Only the reflection body is present." recommendations={[]} />);

    expect(
      screen.queryByRole("heading", {
        name: /media paths that echo this week's themes/i,
      })
    ).not.toBeInTheDocument();
  });
});

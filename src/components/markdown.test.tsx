// Record refs render as chips through the shared <Markdown> wrapper; other
// links stay plain anchors, and a caller's own `a` override still wins.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Markdown from "@/components/markdown";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const id = "3f2a9c1e-1b2c-4d5e-8f90-123456789abc";

describe("<Markdown> record refs", () => {
  it("renders a record link as a chip with its type icon", () => {
    render(<Markdown>{`See [The Dispossessed](/records/${id} "book").`}</Markdown>);
    const link = screen.getByRole("link", { name: /The Dispossessed/ });
    expect(link).toHaveAttribute("href", `/records/${id}`);
    expect(link.textContent).toContain("📖");
    expect(link.className).toContain("rounded-md");
  });

  it("leaves external links as plain anchors", () => {
    render(<Markdown>{"[site](https://example.com)"}</Markdown>);
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link.className).toBe("");
  });

  it("lets a caller override link rendering", () => {
    render(
      <Markdown components={{ a: ({ children }) => <span data-testid="custom">{children}</span> }}>
        {`[x](/records/${id})`}
      </Markdown>,
    );
    expect(screen.getByTestId("custom")).toHaveTextContent("x");
  });
});

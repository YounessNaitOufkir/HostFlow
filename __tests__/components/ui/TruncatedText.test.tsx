import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { TruncatedText } from "@/components/ui/TruncatedText";

/**
 * jsdom performs no layout, so scrollWidth/clientWidth are always 0. These
 * tests stub those two properties to simulate a clipped and an unclipped
 * element, which is exactly what the component branches on.
 */
function setClipped(el: HTMLElement, clipped: boolean) {
  Object.defineProperty(el, "scrollWidth", { value: clipped ? 400 : 100, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: 20, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 20, configurable: true });
}

describe("TruncatedText", () => {
  afterEach(cleanup);

  it("renders exactly one element and adds no wrapper", () => {
    // A wrapper would remove the width constraint that CSS ellipsis depends on,
    // so table columns would stop truncating and start stretching.
    const { container } = render(
      <div data-testid="host">
        <TruncatedText className="truncate">Some long label</TruncatedText>
      </div>
    );

    const host = container.querySelector('[data-testid="host"]')!;
    expect(host.childNodes).toHaveLength(1);
    expect((host.firstChild as HTMLElement).tagName).toBe("SPAN");
    expect(host.firstChild).toHaveClass("truncate");
  });

  it("shows no tooltip when the text fits", () => {
    render(<TruncatedText className="truncate">Short</TruncatedText>);
    const el = screen.getByText("Short");
    setClipped(el, false);

    fireEvent.mouseEnter(el);

    expect(screen.queryAllByText("Short")).toHaveLength(1);
  });

  it("reveals the full text on hover when clipped", () => {
    render(<TruncatedText className="truncate">A very long label indeed</TruncatedText>);
    const el = screen.getByText("A very long label indeed");
    setClipped(el, true);

    fireEvent.mouseEnter(el);

    // Once in the element itself, once in the portalled tooltip
    expect(screen.getAllByText("A very long label indeed")).toHaveLength(2);
  });

  it("hides the tooltip again on mouse leave", () => {
    render(<TruncatedText className="truncate">A very long label indeed</TruncatedText>);
    const el = screen.getByText("A very long label indeed");
    setClipped(el, true);

    fireEvent.mouseEnter(el);
    expect(screen.getAllByText("A very long label indeed")).toHaveLength(2);

    fireEvent.mouseLeave(el);
    expect(screen.getAllByText("A very long label indeed")).toHaveLength(1);
  });

  it("prefers an explicit tooltip over the rendered content", () => {
    render(
      <TruncatedText className="truncate" tooltip="the full value">
        clipped
      </TruncatedText>
    );
    const el = screen.getByText("clipped");
    setClipped(el, true);

    fireEvent.mouseEnter(el);

    expect(screen.getByText("the full value")).toBeInTheDocument();
  });

  it("honours the `as` prop so block layouts are preserved", () => {
    const { container } = render(
      <TruncatedText as="p" className="truncate">
        paragraph text
      </TruncatedText>
    );
    expect(container.querySelector("p")).toBeInTheDocument();
  });
});

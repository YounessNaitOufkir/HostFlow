import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Tooltip } from "@/components/ui/Tooltip";

describe("Tooltip UI Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders wrapped child element correctly", () => {
    render(
      <Tooltip content="Tooltip message">
        <button data-testid="target-button">Hover me</button>
      </Tooltip>
    );

    const button = screen.getByTestId("target-button");
    expect(button).toBeInTheDocument();
    expect(screen.queryByText("Tooltip message")).not.toBeInTheDocument();
  });

  it("shows tooltip content on mouse enter after delay", () => {
    render(
      <Tooltip content="Helpful tip" delay={100}>
        <button data-testid="hover-btn">Hover me</button>
      </Tooltip>
    );

    const container = screen.getByTestId("hover-btn").parentElement!;
    fireEvent.mouseEnter(container);

    // Before timer elapses
    expect(screen.queryByText("Helpful tip")).not.toBeInTheDocument();

    // Advance timers past delay
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("Helpful tip")).toBeInTheDocument();
  });

  it("hides tooltip content on mouse leave", () => {
    render(
      <Tooltip content="Helpful tip" delay={50}>
        <button data-testid="hover-btn">Hover me</button>
      </Tooltip>
    );

    const container = screen.getByTestId("hover-btn").parentElement!;
    fireEvent.mouseEnter(container);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByText("Helpful tip")).toBeInTheDocument();

    fireEvent.mouseLeave(container);

    const tooltip = screen.queryByText("Helpful tip");
    expect(
      tooltip === null ||
        tooltip.getAttribute("style")?.includes("opacity: 0") ||
        tooltip.style.opacity === "0"
    ).toBe(true);
  });

  it("shows tooltip on focus and hides on blur", () => {
    render(
      <Tooltip content="Focus tip" delay={10}>
        <button data-testid="focus-btn">Focus me</button>
      </Tooltip>
    );

    const container = screen.getByTestId("focus-btn").parentElement!;
    fireEvent.focus(container);

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(screen.getByText("Focus tip")).toBeInTheDocument();

    fireEvent.blur(container);

    const tooltip = screen.queryByText("Focus tip");
    expect(
      tooltip === null ||
        tooltip.getAttribute("style")?.includes("opacity: 0") ||
        tooltip.style.opacity === "0"
    ).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

describe("Skeleton UI Component", () => {
  it("renders with default variant classes", () => {
    const { container } = render(<Skeleton data-testid="skeleton-default" />);
    const el = screen.getByTestId("skeleton-default");

    expect(el).toBeInTheDocument();
    // The shimmer animation lives in the .skeleton class in globals.css,
    // not Tailwind's animate-pulse (changed in the loader restyle).
    expect(el).toHaveClass("skeleton");
    expect(el).toHaveClass("rounded-[6px]");
  });

  it("renders circular variant with rounded-full class", () => {
    render(<Skeleton data-testid="skeleton-circular" variant="circular" />);
    const el = screen.getByTestId("skeleton-circular");

    expect(el).toHaveClass("rounded-full");
  });

  it("renders text variant with rounded h-4 w-full classes", () => {
    render(<Skeleton data-testid="skeleton-text" variant="text" />);
    const el = screen.getByTestId("skeleton-text");

    expect(el).toHaveClass("rounded-[6px]");
    expect(el).toHaveClass("h-4");
    expect(el).toHaveClass("w-full");
  });

  it("applies custom className prop correctly", () => {
    render(<Skeleton data-testid="skeleton-custom" className="w-32 h-10 my-custom-class" />);
    const el = screen.getByTestId("skeleton-custom");

    expect(el).toHaveClass("w-32");
    expect(el).toHaveClass("h-10");
    expect(el).toHaveClass("my-custom-class");
  });
});

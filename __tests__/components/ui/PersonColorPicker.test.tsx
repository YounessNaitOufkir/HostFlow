import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { PersonColorPicker } from "@/components/ui/PersonColorPicker";

describe("PersonColorPicker", () => {
  it("says Automatic until a colour is chosen, and saves a pick", async () => {
    const user = userEvent.setup();
    const saved: (string | null)[] = [];
    render(
      <PersonColorPicker
        person={{ id: "u1", full_name: "Amina", color: "#579bfc" }}
        onChange={(c) => saved.push(c)}
      />
    );
    await user.click(screen.getByRole("button", { name: "Colour for Amina" }));
    expect(screen.getByRole("button", { name: /Automatic/, pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "#00a36c" }));
    expect(saved).toEqual(["#00a36c"]);
  });

  it("goes back to automatic, and does not save the colour already set", async () => {
    const user = userEvent.setup();
    const saved: (string | null)[] = [];
    render(
      <PersonColorPicker
        person={{ id: "u1", full_name: "Amina", color: "#00a36c" }}
        onChange={(c) => saved.push(c)}
      />
    );
    await user.click(screen.getByRole("button", { name: "Colour for Amina" }));
    await user.click(screen.getByRole("button", { name: "#00a36c" }));
    await user.click(screen.getByRole("button", { name: "Colour for Amina" }));
    await user.click(screen.getByRole("button", { name: /Automatic/ }));
    expect(saved).toEqual([null]);
  });
});

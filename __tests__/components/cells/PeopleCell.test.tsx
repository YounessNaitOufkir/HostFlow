import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import PeopleCell from "@/components/cells/PeopleCell";
import type { Item, Column, Profile } from "@/types";

/**
 * An assignee can legitimately fall outside your directory — user_directory
 * shows staff to staff, but an external is only visible through an explicit
 * shared membership. The cell must say "someone is on this" rather than render
 * the id away, and must never drop it on write.
 */
describe("PeopleCell — assignees outside the directory", () => {
  const visible: Profile = {
    id: "user-visible",
    full_name: "Visible Colleague",
    avatar_initials: "VC",
    color: "#579bfc",
  } as Profile;

  const makeItem = (assignees: string[]): Item => ({
    id: "item-1",
    board_id: "board-1",
    group_id: "group-1",
    name: "Task",
    position: 0,
    column_values: { people_col: assignees },
  });

  const column: Column = { id: "people_col", title: "Assignee", type: "people" };

  it("shows the placeholder when the only assignee is not in profiles", () => {
    render(
      <PeopleCell
        item={makeItem(["user-hidden"])}
        column={column}
        onUpdate={vi.fn()}
        profiles={[visible]}
      />
    );

    expect(
      screen.getByTitle("Assigned to someone outside your workspace")
    ).toBeInTheDocument();
  });

  it("pluralises the placeholder for several hidden assignees", () => {
    render(
      <PeopleCell
        item={makeItem(["hidden-a", "hidden-b"])}
        column={column}
        onUpdate={vi.fn()}
        profiles={[visible]}
      />
    );

    expect(
      screen.getByTitle("Assigned to 2 people outside your workspace")
    ).toBeInTheDocument();
  });

  it("renders resolved assignees alongside the placeholder", () => {
    render(
      <PeopleCell
        item={makeItem(["user-visible", "user-hidden"])}
        column={column}
        onUpdate={vi.fn()}
        profiles={[visible]}
      />
    );

    expect(screen.getByTitle("Visible Colleague")).toBeInTheDocument();
    expect(
      screen.getByTitle("Assigned to someone outside your workspace")
    ).toBeInTheDocument();
  });

  it("keeps the unassigned state when there are genuinely no assignees", () => {
    render(
      <PeopleCell
        item={makeItem([])}
        column={column}
        onUpdate={vi.fn()}
        profiles={[visible]}
      />
    );

    expect(
      screen.queryByTitle("Assigned to someone outside your workspace")
    ).not.toBeInTheDocument();
  });

  it("preserves a hidden assignee when another person is added", () => {
    const onUpdate = vi.fn();
    const setActiveStatusId = vi.fn();

    render(
      <PeopleCell
        item={makeItem(["user-hidden"])}
        column={column}
        onUpdate={onUpdate}
        profiles={[visible]}
        activeStatusId={"item-1" + "people_col"}
        setActiveStatusId={setActiveStatusId}
      />
    );

    fireEvent.click(screen.getByText("Visible Colleague"));

    // The hidden id must survive the write, not be silently dropped.
    expect(onUpdate).toHaveBeenCalledWith("item-1", "people_col", [
      "user-hidden",
      "user-visible",
    ]);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import PeopleCell from "@/components/cells/PeopleCell";
import { AssignablePeopleContext } from "@/components/AssignablePeopleContext";
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

describe("PeopleCell - who can be assigned", () => {
  const staff: Profile = {
    id: 'u-staff', full_name: 'Amine ABOUTALIB', avatar_initials: 'AA', color: '#f59e0b',
  } as Profile;
  const external: Profile = {
    id: 'u-ext', full_name: 'Sister Externe', avatar_initials: 'SE', color: '#3b82f6',
  } as Profile;

  const col: Column = { id: 'people_col', title: 'Assignee', type: 'people' };
  const mkItem = (assignees: string[]): Item => ({
    id: 'item-1', board_id: 'b1', group_id: 'g1', name: 'Task', position: 0,
    column_values: { people_col: assignees },
  });
  // The dropdown is controlled by the parent, so render it already open.
  const OPEN = 'item-1people_col';

  const renderOpen = (assignees: string[], assignable: Set<string> | null) =>
    render(
      <AssignablePeopleContext.Provider value={assignable}>
        <PeopleCell
          item={mkItem(assignees)}
          column={col}
          onUpdate={vi.fn()}
          profiles={[staff, external]}
          activeStatusId={OPEN}
          setActiveStatusId={vi.fn()}
        />
      </AssignablePeopleContext.Provider>
    );

  it('does not offer an external person on a staff-only workspace', () => {
    // A shared workspace refuses externals outright, so assigning one there
    // would hand someone a task on a board they cannot open.
    renderOpen([], new Set([staff.id]));
    expect(screen.getByText('Amine ABOUTALIB')).toBeInTheDocument();
    expect(screen.queryByText('Sister Externe')).not.toBeInTheDocument();
  });

  it('still offers an external who is already assigned, so it can be undone', () => {
    renderOpen([external.id], new Set([staff.id]));
    expect(screen.getAllByText('Sister Externe').length).toBeGreaterThan(0);
  });

  it('offers everyone when there is no restriction (a private workspace)', () => {
    renderOpen([], null);
    expect(screen.getByText('Sister Externe')).toBeInTheDocument();
  });
});

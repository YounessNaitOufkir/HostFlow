import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import PeopleCell from "@/components/cells/PeopleCell";
import { AssignablePeopleContext } from "@/components/AssignablePeopleContext";
import { BoardAccessContext, type BoardAccessValue } from "@/components/BoardAccessContext";
import type { Item, Column, Profile } from "@/types";

// PeopleCell reads the signed-in user itself (to always offer "yourself" on a
// private board, see the "who can be assigned" describe block below) rather
// than receiving it as a prop.
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ profile: { id: "u-staff" } }),
}));

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

    // Explicit, non-null restriction: this test is about a write surviving,
    // not about who a private board's default (null) restricts to — that is
    // covered separately below.
    render(
      <AssignablePeopleContext.Provider value={new Set(["user-visible", "user-hidden"])}>
        <PeopleCell
          item={makeItem(["user-hidden"])}
          column={column}
          onUpdate={onUpdate}
          profiles={[visible]}
          activeStatusId={"item-1" + "people_col"}
          setActiveStatusId={setActiveStatusId}
        />
      </AssignablePeopleContext.Provider>
    );

    fireEvent.click(screen.getByText("Visible Colleague"));

    // The hidden id must survive the write, not be silently dropped. No
    // BoardAccessContext is provided here, so useBoardAccess() is null and
    // the guard never enters into it — this test is purely about the write.
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

  it('offers only yourself on a private workspace, never the whole directory', () => {
    // null used to mean "no restriction, offer every profile" — a private
    // workspace's own picker is not the place to browse the company
    // directory. Inviting someone happens in the Workspace Members modal.
    renderOpen([], null);
    expect(screen.getByText('Amine ABOUTALIB')).toBeInTheDocument(); // the signed-in user, mocked above
    expect(screen.queryByText('Sister Externe')).not.toBeInTheDocument();
  });

  it('still offers an already-assigned person on a private workspace, so it can be undone', () => {
    renderOpen([external.id], null);
    expect(screen.getAllByText('Sister Externe').length).toBeGreaterThan(0);
  });

  it('offers someone explicitly invited to a private workspace, not just yourself', () => {
    // Bug: the picker on a private workspace only ever showed the signed-in
    // user, even for someone the owner had genuinely invited to that
    // workspace via workspace_members — workspaceMemberRoles is that grant.
    render(
      <AssignablePeopleContext.Provider value={null}>
        <BoardAccessContext.Provider
          value={{
            hasAccess: () => true,
            canGrant: false,
            grant: vi.fn(),
            workspaceMemberRoles: new Map([[external.id, 'member']]),
          }}
        >
          <PeopleCell
            item={mkItem([])}
            column={col}
            onUpdate={vi.fn()}
            profiles={[staff, external]}
            activeStatusId={OPEN}
            setActiveStatusId={vi.fn()}
          />
        </BoardAccessContext.Provider>
      </AssignablePeopleContext.Provider>
    );
    expect(screen.getByText('Amine ABOUTALIB')).toBeInTheDocument();
    expect(screen.getByText('Sister Externe')).toBeInTheDocument();
  });
});

/**
 * Step 6 built this guard, Step 7 removed it everywhere (the private-workspace
 * picker no longer offers anyone it would even apply to), Step 9 restores it
 * for shared workspaces specifically — a colleague the directory offers but
 * who lacks real board access should never be assigned silently.
 */
describe("PeopleCell - the assignee access guard (shared workspaces)", () => {
  const staff: Profile = {
    id: "u-staff", full_name: "Amine ABOUTALIB", avatar_initials: "AA", color: "#f59e0b",
  } as Profile;
  const colleague: Profile = {
    id: "u-colleague", full_name: "Sara K.", avatar_initials: "SK", color: "#00c875",
  } as Profile;

  const col: Column = { id: "people_col", title: "Assignee", type: "people" };
  const item: Item = {
    id: "item-1", board_id: "b1", group_id: "g1", name: "Task", position: 0,
    column_values: { people_col: [] },
  };
  const OPEN = "item-1people_col";

  const renderShared = (boardAccess: Omit<BoardAccessValue, "workspaceMemberRoles">, onUpdate = vi.fn()) =>
    render(
      <AssignablePeopleContext.Provider value={new Set([staff.id, colleague.id])}>
        <BoardAccessContext.Provider value={{ ...boardAccess, workspaceMemberRoles: new Map() }}>
          <PeopleCell
            item={item}
            column={col}
            onUpdate={onUpdate}
            profiles={[staff, colleague]}
            activeStatusId={OPEN}
            setActiveStatusId={vi.fn()}
          />
        </BoardAccessContext.Provider>
      </AssignablePeopleContext.Provider>
    );

  it("shows the guard instead of assigning when the picked colleague lacks board access", () => {
    const onUpdate = vi.fn();
    renderShared({ hasAccess: () => false, canGrant: true, grant: vi.fn() }, onUpdate);

    fireEvent.click(screen.getByText("Sara K."));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/Grant & assign/i)).toBeInTheDocument();
    expect(screen.getByText(/Assign anyway/i)).toBeInTheDocument();
  });

  it('"Assign anyway" assigns without calling grant()', () => {
    const onUpdate = vi.fn();
    const grant = vi.fn().mockResolvedValue(true);
    renderShared({ hasAccess: () => false, canGrant: true, grant }, onUpdate);

    fireEvent.click(screen.getByText("Sara K."));
    fireEvent.click(screen.getByText(/Assign anyway/i));

    expect(grant).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith("item-1", "people_col", ["u-colleague"]);
  });

  it('"Grant & assign" calls grant() and then assigns', async () => {
    const onUpdate = vi.fn();
    const grant = vi.fn().mockResolvedValue(true);
    renderShared({ hasAccess: () => false, canGrant: true, grant }, onUpdate);

    fireEvent.click(screen.getByText("Sara K."));
    fireEvent.click(screen.getByText(/Grant & assign/i));

    await waitFor(() => expect(grant).toHaveBeenCalledWith("u-colleague"));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("item-1", "people_col", ["u-colleague"])
    );
  });

  it("does not offer Grant & assign when the signed-in user cannot grant board access", () => {
    renderShared({ hasAccess: () => false, canGrant: false, grant: vi.fn() });

    fireEvent.click(screen.getByText("Sara K."));

    expect(screen.queryByText(/Grant & assign/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Assign anyway/i)).toBeInTheDocument();
  });

  it("assigns directly, no guard, when the picked colleague already has board access", () => {
    const onUpdate = vi.fn();
    renderShared({ hasAccess: () => true, canGrant: true, grant: vi.fn() }, onUpdate);

    fireEvent.click(screen.getByText("Sara K."));

    expect(onUpdate).toHaveBeenCalledWith("item-1", "people_col", ["u-colleague"]);
    expect(screen.queryByText(/Grant & assign/i)).not.toBeInTheDocument();
  });
});

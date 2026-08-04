import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import ProfileMenu from "@/components/ProfileMenu";
import type { Profile } from "@/types";

describe("Admin Rights & Platform Owner Safety Protection — Batch 4.4", () => {
  const ownerProfile: Profile = {
    id: "user-owner-1",
    email: "younessnaitoufkir@gmail.com",
    full_name: "Youness Owner",
    role: "member", // testing recovery state when role wasn't admin
    avatar_initials: "YO",
  };

  const regularUserProfile: Profile = {
    id: "user-reg-1",
    email: "randomuser@example.com",
    full_name: "Random Member",
    role: "member",
    avatar_initials: "RM",
  };

  const adminUserProfile: Profile = {
    id: "user-admin-1",
    email: "otheradmin@example.com",
    full_name: "Other Admin",
    role: "admin",
    avatar_initials: "OA",
  };

  const mockCallbacks = {
    onSignOut: vi.fn(),
    onOpenAdmin: vi.fn(),
    onOpenProfileSettings: vi.fn(),
    onOpenSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Restore Admin Rights' ONLY to platform owner younessnaitoufkir@gmail.com when not admin", () => {
    render(<ProfileMenu profile={ownerProfile} {...mockCallbacks} />);

    // Click avatar to open profile menu dropdown
    const avatar = screen.getByTitle("Youness Owner");
    fireEvent.click(avatar);

    expect(screen.getByText("Restore Admin Rights")).toBeInTheDocument();
  });

  it("NEVER shows 'Restore Admin Rights' to any other non-admin user", () => {
    render(<ProfileMenu profile={regularUserProfile} {...mockCallbacks} />);

    const avatar = screen.getByTitle("Random Member");
    fireEvent.click(avatar);

    expect(screen.queryByText("Restore Admin Rights")).not.toBeInTheDocument();
  });

  it("shows 'Admin Settings' menu item for active administrators", () => {
    render(<ProfileMenu profile={adminUserProfile} {...mockCallbacks} />);

    const avatar = screen.getByTitle("Other Admin");
    fireEvent.click(avatar);

    expect(screen.getByText("Admin Settings")).toBeInTheDocument();
    expect(screen.queryByText("Restore Admin Rights")).not.toBeInTheDocument();
  });
});

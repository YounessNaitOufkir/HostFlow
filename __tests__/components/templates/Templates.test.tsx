import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  saveBoardTemplate: vi.fn(),
  renameBoardTemplate: vi.fn(),
  deleteBoardTemplate: vi.fn(),
}));
vi.mock("@/lib/companyTemplates", () => api);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SaveTemplateDialog } from "@/components/templates/SaveTemplateDialog";
import { BLANK, CompanyTemplatePicker } from "@/components/templates/CompanyTemplatePicker";

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const templates = [
  { id: "t1", name: "Renovation – standard", task_count: 32, group_count: 1, updated_at: "" },
  { id: "t2", name: "Quick refresh", task_count: 1, group_count: 3, updated_at: "" },
];

describe("SaveTemplateDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves under the board's name by default", async () => {
    api.saveBoardTemplate.mockResolvedValue({ ok: true, id: "t9" });
    const onClose = vi.fn();
    wrap(<SaveTemplateDialog boardId="b1" boardName="Lancement" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.saveBoardTemplate).toHaveBeenCalledWith("b1", "Lancement", false);
  });

  it("asks before replacing a template of the same name, and replaces on confirm", async () => {
    api.saveBoardTemplate.mockResolvedValueOnce({ ok: false, reason: "taken" }).mockResolvedValueOnce({ ok: true, id: "t1" });
    const onClose = vi.fn();
    wrap(<SaveTemplateDialog boardId="b1" boardName="Lancement" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.saveBoardTemplate).toHaveBeenLastCalledWith("b1", "Lancement", true);
  });

  it("typing a new name leaves the replace question", async () => {
    api.saveBoardTemplate.mockResolvedValue({ ok: false, reason: "taken" });
    wrap(<SaveTemplateDialog boardId="b1" boardName="Lancement" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Lancement v2" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save template" })).toBeInTheDocument();
  });
});

describe("CompanyTemplatePicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists templates with counts, then Blank", () => {
    wrap(<CompanyTemplatePicker templates={templates} loading={false} selected="t1" onSelect={vi.fn()} canManage={false} />);
    expect(screen.getByText("32 tasks · 1 group")).toBeInTheDocument();
    expect(screen.getByText("1 task · 3 groups")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Blank board/ })).toBeInTheDocument();
  });

  it("hides rename and delete from anyone but admins", () => {
    wrap(<CompanyTemplatePicker templates={templates} loading={false} selected="t1" onSelect={vi.fn()} canManage={false} />);
    expect(screen.queryByRole("button", { name: /Rename template/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete template/ })).toBeNull();
  });

  it("an admin renames a template in place, and is told when the name is taken", async () => {
    api.renameBoardTemplate.mockResolvedValue("taken");
    wrap(<CompanyTemplatePicker templates={templates} loading={false} selected="t1" onSelect={vi.fn()} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Rename template Quick refresh" }));
    const field = screen.getByLabelText("Template name");
    fireEvent.change(field, { target: { value: "Renovation – standard" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Another template already has this name.");
    expect(api.renameBoardTemplate).toHaveBeenCalledWith("t2", "Renovation – standard");
  });

  it("deleting the selected template moves the choice to Blank", async () => {
    api.deleteBoardTemplate.mockResolvedValue(true);
    const onSelect = vi.fn();
    wrap(<CompanyTemplatePicker templates={templates} loading={false} selected="t1" onSelect={onSelect} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete template Renovation – standard" }));
    expect(screen.getByText(/Boards made from it are not affected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(BLANK));
  });
});

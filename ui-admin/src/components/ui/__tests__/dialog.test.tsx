import { render, screen, fireEvent } from "@testing-library/react";
import { createElement, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "../dialog";

// Helper component that manages dialog open state internally
function DialogHarness({
  defaultOpen = false,
  onOpenChange,
}: {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function handleOpenChange(value: boolean) {
    setOpen(value);
    onOpenChange?.(value);
  }

  return createElement(
    Dialog,
    { open, onOpenChange: handleOpenChange },
    createElement(DialogTrigger, null, "Open Dialog"),
    createElement(
      DialogContent,
      null,
      createElement(DialogTitle, null, "Test Title"),
      createElement(DialogDescription, null, "Test Description"),
      createElement("input", {
        "data-testid": "dialog-input",
        placeholder: "Type here",
      }),
      createElement("button", { "data-testid": "dialog-action" }, "Confirm"),
    ),
  );
}

describe("Dialog", () => {
  it("does not render content when closed", () => {
    render(createElement(DialogHarness));

    expect(screen.queryByText("Test Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Test Description")).not.toBeInTheDocument();
  });

  it("renders content when open", () => {
    render(createElement(DialogHarness, { defaultOpen: true }));

    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test Description")).toBeInTheDocument();
  });

  it("opens when trigger is clicked", () => {
    render(createElement(DialogHarness));

    expect(screen.queryByText("Test Title")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Open Dialog"));

    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("closes when close button is clicked", () => {
    render(createElement(DialogHarness, { defaultOpen: true }));

    expect(screen.getByText("Test Title")).toBeInTheDocument();

    // The close button has sr-only text "Close"
    fireEvent.click(screen.getByText("Close"));

    expect(screen.queryByText("Test Title")).not.toBeInTheDocument();
  });

  it("closes when Escape key is pressed", () => {
    const onOpenChange = vi.fn();
    render(createElement(DialogHarness, { defaultOpen: true, onOpenChange }));

    expect(screen.getByText("Test Title")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Test Title")).not.toBeInTheDocument();
  });

  it("has correct aria attributes", () => {
    render(createElement(DialogHarness, { defaultOpen: true }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");

    // The title id should match the aria-labelledby
    const titleId = dialog.getAttribute("aria-labelledby");
    const title = document.getElementById(titleId!);
    expect(title).toHaveTextContent("Test Title");

    // The description id should match the aria-describedby
    const descId = dialog.getAttribute("aria-describedby");
    const desc = document.getElementById(descId!);
    expect(desc).toHaveTextContent("Test Description");
  });

  it("closes when clicking overlay", () => {
    const onOpenChange = vi.fn();
    render(createElement(DialogHarness, { defaultOpen: true, onOpenChange }));

    expect(screen.getByText("Test Title")).toBeInTheDocument();

    // The overlay is the fixed inset-0 div rendered before the dialog content
    const dialog = screen.getByRole("dialog");
    const overlay = dialog.previousElementSibling;
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("prevents body scroll when open", () => {
    const { unmount } = render(createElement(DialogHarness, { defaultOpen: true }));

    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    // After unmount, overflow should be restored
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("calls onOpenChange callback when opened and closed", () => {
    const onOpenChange = vi.fn();
    render(createElement(DialogHarness, { onOpenChange }));

    fireEvent.click(screen.getByText("Open Dialog"));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByText("Close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

"use client";

import { useEffect } from "react";

type EnterToNextFieldProps = {
  formId: string;
};

function isFocusableField(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.hasAttribute("disabled")) {
    return false;
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (element.tabIndex < 0) {
    return false;
  }
  if (element instanceof HTMLInputElement && element.type === "hidden") {
    return false;
  }
  return true;
}

export function EnterToNextField({ formId }: EnterToNextFieldProps) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      if (event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.target instanceof HTMLButtonElement) {
        return;
      }
      if (event.target instanceof HTMLInputElement && event.target.type === "submit") {
        return;
      }

      const fields = Array.from(
        form.querySelectorAll("input, select, textarea, button, [tabindex]"),
      ).filter(isFocusableField) as HTMLElement[];
      const currentIndex = fields.findIndex((item) => item === event.target);
      if (currentIndex < 0 || currentIndex >= fields.length - 1) {
        return;
      }

      event.preventDefault();
      fields[currentIndex + 1]?.focus();
    };

    form.addEventListener("keydown", handleKeydown);
    return () => {
      form.removeEventListener("keydown", handleKeydown);
    };
  }, [formId]);

  return null;
}

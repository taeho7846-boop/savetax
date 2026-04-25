"use client";

import { useEffect } from "react";

const DRIVE_BASE_KEY = "savetax-drive-base-path";

export function DriveBasePathSync({ value }: { value: string | null }) {
  useEffect(() => {
    if (value && value.trim()) {
      localStorage.setItem(DRIVE_BASE_KEY, value.trim());
    } else {
      localStorage.removeItem(DRIVE_BASE_KEY);
    }
  }, [value]);
  return null;
}

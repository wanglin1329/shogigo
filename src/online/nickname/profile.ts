// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: moved to src/online/nickname.

import { isGeneratedName, randomName } from "./words";

export type NameMode = "default" | "1" | "0";

/** Restore a saved choice before assigning a neutral name to a new visitor. */
export function initialNameProfile(
  storedName: string,
  storedMode: string,
): { name: string; mode: NameMode } {
  if (storedMode === "1") {
    return { name: isGeneratedName(storedName) ? storedName : randomName(), mode: "1" };
  }
  if (storedMode === "default") {
    return {
      name: /^Player\d{4}$/.test(storedName) ? storedName : neutralName(),
      mode: "default",
    };
  }
  if (storedMode === "0" || storedName) return { name: storedName, mode: "0" };
  return { name: neutralName(), mode: "default" };
}

function neutralName(): string {
  return `Player${1000 + Math.floor(Math.random() * 9000)}`;
}

/** Keep invalid characters visible so the input can explain how to fix them. */
export function normalizeCustomName(value: string): string {
  try {
    return value.normalize("NFKC");
  } catch {
    return value;
  }
}

/** Same characters as the server, so names saved by earlier versions stay editable. */
export function validCustomName(value: string): boolean {
  return value === "" || /^[A-Za-z0-9_\-.]{1,10}$/.test(value);
}

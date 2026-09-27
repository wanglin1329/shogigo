// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: split out of the name-filter test; requests go through the
// Worker entry (exports.default) instead of SELF.

import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("normalizeDisplayName integration (via the rooms API)", () => {
  const UID = "dddddddd-4444-4444-8444-444444444444";
  let ip = 1;
  async function createRoomWithName(displayName: unknown) {
    ip += 1;
    const res = await exports.default.fetch("https://example.com/api/rooms", {
      method: "POST",
      headers: { "CF-Connecting-IP": `10.7.0.${ip}` },
      body: JSON.stringify({ uid: UID, displayName }),
    });
    return (await res.json()) as { match?: { sente_name: string | null } };
  }

  it("masks NG words end to end", async () => {
    const json = await createRoomWithName("FuckMan99");
    expect(json.match?.sente_name).toBe("****Man99");
  });

  it("strips disallowed characters and caps at 10", async () => {
    const json = await createRoomWithName("山田yamada太郎12345");
    expect(json.match?.sente_name).toBe("yamada1234");
  });

  it("stores null when nothing survives normalization", async () => {
    const json = await createRoomWithName("山田太郎！");
    expect(json.match?.sente_name).toBeNull();
  });
});

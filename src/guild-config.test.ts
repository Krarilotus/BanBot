import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultsForGuild, effectiveActionMode, GuildConfigStore } from "./guild-config.js";
import type { Config } from "./config.js";

const dirs: string[] = [];

after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function appConfig(): Config {
  return {
    discordToken: "token",
    defaultActionMode: "dry-run",
    defaultDeleteMessageSeconds: 86400,
    healthHost: "127.0.0.1",
    runtimeConfigPath: "/data/config.json",
  };
}

describe("GuildConfigStore", () => {
  it("persists guild config to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "banbot-"));
    dirs.push(dir);
    const store = new GuildConfigStore(join(dir, "config.json"));
    const config = defaultsForGuild("guild-id", appConfig(), "admin-id");
    config.trapChannelIds = ["trap-channel"];

    await store.set("guild-id", config);

    assert.deepEqual(await store.get("guild-id"), config);
  });
});

describe("effectiveActionMode", () => {
  it("keeps unconfirmed ban mode as dry-run", () => {
    const config = defaultsForGuild("guild-id", appConfig(), "admin-id");
    config.actionMode = "ban";
    config.banConfirmed = false;

    assert.equal(effectiveActionMode(config), "dry-run");
  });
});

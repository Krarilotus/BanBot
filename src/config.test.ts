import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

const validEnv = {
  DISCORD_TOKEN: "token",
  CLIENT_ID: "123456789012345678",
  ACTION_MODE: "dry-run",
  DELETE_MESSAGE_SECONDS: "86400",
};

describe("loadConfig", () => {
  it("loads the safe dry-run default config", () => {
    const config = loadConfig(validEnv);

    assert.equal(config.defaultActionMode, "dry-run");
    assert.equal(config.defaultDeleteMessageSeconds, 86400);
    assert.equal(config.runtimeConfigPath, "/data/config.json");
  });

  it("allows ban as a default only for future Discord-side setup", () => {
    const config = loadConfig({ ...validEnv, ACTION_MODE: "ban" });

    assert.equal(config.defaultActionMode, "ban");
  });

  it("rejects suspicious client IDs and deletion windows", () => {
    assert.throws(
      () => loadConfig({ ...validEnv, CLIENT_ID: "not-client", DELETE_MESSAGE_SECONDS: "604801" }),
      /CLIENT_ID must look like a Discord snowflake[\s\S]*DELETE_MESSAGE_SECONDS/,
    );
  });
});

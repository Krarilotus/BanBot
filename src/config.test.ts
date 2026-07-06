import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

const validEnv = {
  DISCORD_TOKEN: "token",
  CLIENT_ID: "123456789012345678",
  TRAP_CHANNEL_IDS: "123456789012345678,234567890123456789",
  ACTION_MODE: "dry-run",
  DELETE_MESSAGE_SECONDS: "86400",
};

describe("loadConfig", () => {
  it("loads the safe dry-run default config", () => {
    const config = loadConfig(validEnv);

    assert.equal(config.actionMode, "dry-run");
    assert.equal(config.deleteMessageSeconds, 86400);
    assert.deepEqual([...config.trapChannelIds], ["123456789012345678", "234567890123456789"]);
  });

  it("refuses ban mode without explicit confirmation", () => {
    assert.throws(
      () => loadConfig({ ...validEnv, ACTION_MODE: "ban", CONFIRM_CONFIG: "false" }),
      /ACTION_MODE=ban requires CONFIRM_CONFIG=true/,
    );
  });

  it("accepts ban mode only with explicit confirmation", () => {
    const config = loadConfig({ ...validEnv, ACTION_MODE: "ban", CONFIRM_CONFIG: "true" });

    assert.equal(config.actionMode, "ban");
  });

  it("rejects suspicious Discord IDs and deletion windows", () => {
    assert.throws(
      () => loadConfig({ ...validEnv, TRAP_CHANNEL_IDS: "not-a-channel", DELETE_MESSAGE_SECONDS: "604801" }),
      /TRAP_CHANNEL_IDS contains invalid ID: not-a-channel[\s\S]*DELETE_MESSAGE_SECONDS/,
    );
  });
});

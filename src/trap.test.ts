import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "discord.js";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import { handleTrapMessage, hasAnyNonEveryoneRole } from "./trap.js";

describe("hasAnyNonEveryoneRole", () => {
  it("returns false for only @everyone", () => {
    assert.equal(hasAnyNonEveryoneRole("guild", ["guild"]), false);
  });

  it("returns true when any other role exists", () => {
    assert.equal(hasAnyNonEveryoneRole("guild", ["guild", "role"]), true);
  });

  it("returns false for an empty iterable", () => {
    assert.equal(hasAnyNonEveryoneRole("guild", []), false);
  });
});

function config(overrides: Partial<Config> = {}): Config {
  return {
    discordToken: "token",
    trapChannelIds: new Set(["trap-channel"]),
    actionMode: "dry-run",
    deleteMessageSeconds: 86400,
    healthHost: "127.0.0.1",
    ...overrides,
  };
}

function logger() {
  const calls: string[] = [];
  return {
    calls,
    instance: {
      logAction: async () => {
        calls.push("logAction");
      },
      notifyBan: async () => {
        calls.push("notifyBan");
      },
    } as unknown as Logger,
  };
}

function message(options: {
  authorId?: string;
  authorBot?: boolean;
  botUserId?: string;
  channelId?: string;
  webhookId?: string | null;
  roleIds?: string[];
  bannable?: boolean;
  botCanBan?: boolean;
  ban?: () => Promise<void>;
} = {}): Message {
  const guildId = "guild-id";
  const authorId = options.authorId ?? "user-id";
  const roleIds = options.roleIds ?? [guildId];

  return {
    guildId,
    channelId: options.channelId ?? "trap-channel",
    webhookId: options.webhookId ?? null,
    client: { user: { id: options.botUserId ?? "bot-id" } },
    author: {
      id: authorId,
      bot: options.authorBot ?? false,
      tag: "test-user#0000",
    },
    guild: {
      id: guildId,
      name: "Test Guild",
      members: {
        me: {
          permissions: {
            has: () => options.botCanBan ?? true,
          },
        },
        fetchMe: async () => ({
          permissions: {
            has: () => options.botCanBan ?? true,
          },
        }),
        fetch: async () => ({ id: authorId }),
      },
    },
    member: {
      roles: {
        cache: {
          keys: () => roleIds.values(),
        },
      },
      bannable: options.bannable ?? true,
      ban: options.ban ?? (async () => undefined),
    },
  } as unknown as Message;
}

describe("handleTrapMessage", () => {
  it("ignores bot-authored trap messages so the bot never reacts to its own notification", async () => {
    let banCalls = 0;
    const logs = logger();

    const result = await handleTrapMessage(
      message({
        authorId: "bot-id",
        authorBot: true,
        botUserId: "bot-id",
        ban: async () => {
          banCalls += 1;
        },
      }),
      config({ actionMode: "ban" }),
      logs.instance,
    );

    assert.deepEqual(result, { kind: "ignored", reason: "bot author" });
    assert.equal(banCalls, 0);
    assert.deepEqual(logs.calls, []);
  });

  it("ignores self messages even if a malformed mock/event did not mark the author as a bot", async () => {
    let banCalls = 0;
    const logs = logger();

    const result = await handleTrapMessage(
      message({
        authorId: "bot-id",
        authorBot: false,
        botUserId: "bot-id",
        ban: async () => {
          banCalls += 1;
        },
      }),
      config({ actionMode: "ban" }),
      logs.instance,
    );

    assert.deepEqual(result, { kind: "ignored", reason: "self message" });
    assert.equal(banCalls, 0);
    assert.deepEqual(logs.calls, []);
  });

  it("dry-runs roleless users in trap channels by default", async () => {
    const logs = logger();

    const result = await handleTrapMessage(message({ authorId: "dry-run-user" }), config(), logs.instance);

    assert.equal(result.kind, "dry-run");
    assert.equal(result.userId, "dry-run-user");
    assert.deepEqual(logs.calls, ["logAction"]);
  });

  it("ignores users with any non-everyone role", async () => {
    const logs = logger();

    const result = await handleTrapMessage(
      message({ authorId: "approved-user", roleIds: ["guild-id", "member-role"] }),
      config(),
      logs.instance,
    );

    assert.deepEqual(result, { kind: "ignored", reason: "user has a non-everyone role" });
    assert.deepEqual(logs.calls, []);
  });

  it("bans roleless users in ban mode and requests recent message deletion", async () => {
    const logs = logger();
    let banOptions: unknown;

    const result = await handleTrapMessage(
      message({
        authorId: "ban-user",
        ban: async (options?: unknown) => {
          banOptions = options;
        },
      }),
      config({ actionMode: "ban", deleteMessageSeconds: 123 }),
      logs.instance,
    );

    assert.equal(result.kind, "banned");
    assert.deepEqual(banOptions, {
      deleteMessageSeconds: 123,
      reason: "Trap channel hit: trap-channel; user had only @everyone",
    });
    assert.deepEqual(logs.calls, ["notifyBan", "logAction"]);
  });
});

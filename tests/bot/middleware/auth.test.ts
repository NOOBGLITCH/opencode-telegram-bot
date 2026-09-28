import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, NextFunction } from "grammy";

const mocked = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: mocked.loggerDebugMock,
    info: vi.fn(),
    warn: mocked.loggerWarnMock,
    error: vi.fn(),
  },
}));

import { config } from "../../../src/config.js";
import { authMiddleware } from "../../../src/bot/middleware/auth.js";

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.telegram.allowedUserId = 6732788379;
    config.telegram.allowedUserIds = [6732788379, 8658166458, 544684142];
  });

  it("grants access to all allowed users", async () => {
    for (const userId of [6732788379, 8658166458, 544684142]) {
      const next: NextFunction = vi.fn().mockResolvedValue(undefined);
      const ctx = {
        from: { id: userId },
        chat: { id: userId },
        callbackQuery: undefined,
        message: { text: "hello" },
        api: { setMyCommands: vi.fn() },
      } as unknown as Context;

      await authMiddleware(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects unauthorized users", async () => {
    const next: NextFunction = vi.fn().mockResolvedValue(undefined);
    const setMyCommands = vi.fn().mockResolvedValue(true);

    const ctx = {
      from: { id: 999999999 },
      chat: { id: 999999999 },
      callbackQuery: undefined,
      message: { text: "hello" },
      api: { setMyCommands },
    } as unknown as Context;

    await authMiddleware(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocked.loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining("Unauthorized access attempt from user ID: 999999999"),
    );
    expect(setMyCommands).toHaveBeenCalledWith([], {
      scope: { type: "chat", chat_id: 999999999 },
    });
  });
});

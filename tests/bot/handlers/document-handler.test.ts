import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { handleDocumentMessage, type DocumentHandlerDeps } from "../../../src/bot/handlers/document-handler.js";

const mocked = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: mocked.loggerDebugMock,
    info: mocked.loggerInfoMock,
    warn: mocked.loggerWarnMock,
    error: mocked.loggerErrorMock,
  },
}));

describe("handleDocumentMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles m3u8 playlist file as text prompt", async () => {
    const processPrompt = vi.fn().mockResolvedValue(true);
    const m3u8Content = "#EXTM3U\n#EXTINF:-1,Channel 1\nhttp://example.com/live.m3u8";

    const ctx = {
      chat: { id: 12345 },
      message: {
        message_id: 101,
        caption: "check this playlist",
        document: {
          file_id: "m3u8_file_123",
          file_name: "vzy_playlist.m3u8",
          mime_type: "application/vnd.apple.mpegurl",
          file_size: m3u8Content.length,
        },
      },
      reply: vi.fn().mockResolvedValue(undefined),
      api: {},
    } as unknown as Context;

    const downloadFile = vi.fn().mockResolvedValue({
      buffer: Buffer.from(m3u8Content, "utf-8"),
      filePath: "vzy_playlist.m3u8",
    });

    const deps = {
      downloadFile,
      processPrompt,
    } as unknown as DocumentHandlerDeps;

    await handleDocumentMessage(ctx, deps);

    expect(ctx.reply).toHaveBeenCalledWith("⏳ Downloading file...");
    expect(processPrompt).toHaveBeenCalledTimes(1);

    const [, calledInput] = processPrompt.mock.calls[0]!;
    expect(calledInput.text).toContain("--- Content of vzy_playlist.m3u8 ---");
    expect(calledInput.text).toContain(m3u8Content);
    expect(calledInput.text).toContain("check this playlist");
  });

  it("handles arbitrary media / binary file without rejecting as unsupported", async () => {
    const processPrompt = vi.fn().mockResolvedValue(true);
    // Binary buffer containing null bytes
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);

    const ctx = {
      chat: { id: 12345 },
      message: {
        message_id: 102,
        caption: "check this binary",
        document: {
          file_id: "bin_file_123",
          file_name: "firmware.bin",
          mime_type: "application/octet-stream",
          file_size: binaryData.length,
        },
      },
      reply: vi.fn().mockResolvedValue(undefined),
      api: {},
    } as unknown as Context;

    const downloadFile = vi.fn().mockResolvedValue({
      buffer: binaryData,
      filePath: "firmware.bin",
    });

    const deps = {
      downloadFile,
      processPrompt,
    } as unknown as DocumentHandlerDeps;

    await handleDocumentMessage(ctx, deps);

    expect(ctx.reply).toHaveBeenCalledWith("⏳ Downloading file...");
    expect(processPrompt).toHaveBeenCalledTimes(1);

    const [, calledInput] = processPrompt.mock.calls[0]!;
    expect(calledInput.fileParts).toHaveLength(1);
    expect(calledInput.fileParts![0]!.filename).toBe("firmware.bin");
    expect(calledInput.fileParts![0]!.mime).toBe("application/octet-stream");
    expect(calledInput.fileParts![0]!.url).toContain("data:application/octet-stream;base64,");
  });

  it("handles video message via document handler", async () => {
    const processPrompt = vi.fn().mockResolvedValue(true);
    const videoData = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // mp4 ftyp header

    const ctx = {
      chat: { id: 12345 },
      message: {
        message_id: 103,
        caption: "look at video",
        video: {
          file_id: "video_file_123",
          file_name: "clip.mp4",
          mime_type: "video/mp4",
          file_size: videoData.length,
          duration: 10,
        },
      },
      reply: vi.fn().mockResolvedValue(undefined),
      api: {},
    } as unknown as Context;

    const downloadFile = vi.fn().mockResolvedValue({
      buffer: videoData,
      filePath: "clip.mp4",
    });

    const deps = {
      downloadFile,
      processPrompt,
    } as unknown as DocumentHandlerDeps;

    await handleDocumentMessage(ctx, deps);

    expect(ctx.reply).toHaveBeenCalledWith("⏳ Downloading file...");
    expect(processPrompt).toHaveBeenCalledTimes(1);

    const [, calledInput] = processPrompt.mock.calls[0]!;
    expect(calledInput.fileParts).toHaveLength(1);
    expect(calledInput.fileParts![0]!.filename).toBe("clip.mp4");
    expect(calledInput.fileParts![0]!.mime).toBe("video/mp4");
  });
});

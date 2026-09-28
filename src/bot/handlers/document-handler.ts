import type { Context } from "grammy";
import { config } from "../../config.js";
import { processUserPrompt, type ProcessPromptDeps } from "./prompt.js";
import {
  downloadTelegramFile,
  toDataUri,
  isTextMimeType,
  isTextBuffer,
  isFileSizeAllowed,
} from "../../app/services/file-download-service.js";
import { isDocExtractorConfigured, extractDocument } from "../../app/services/document-extractor-service.js";
import { getModelCapabilities, supportsInput } from "../../app/services/model-capabilities-service.js";
import { getStoredModel } from "../../app/services/model-selection-service.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import type { FilePartInput, Model } from "@opencode-ai/sdk/v2";
import { flushPendingPrompt } from "./message-merger.js";
import { createIncomingPrompt, type IncomingPrompt } from "../../app/types/prompt.js";
import {
  rejectQueuedMediaBeforePreparation,
  tryEnqueuePromptIfBusy,
} from "./prompt-queue-dispatch.js";

export interface DocumentHandlerDeps extends ProcessPromptDeps {
  downloadFile?: (
    api: Context["api"],
    fileId: string,
  ) => Promise<{ buffer: Buffer; filePath: string }>;
  getModelCapabilities?: (
    providerId: string,
    modelId: string,
  ) => Promise<Model["capabilities"] | null>;
  getStoredModel?: () => { providerID: string; modelID: string };
  processPrompt?: (
    ctx: Context,
    input: IncomingPrompt,
    deps: ProcessPromptDeps,
  ) => Promise<boolean>;
}

export async function handleDocumentMessage(
  ctx: Context,
  deps: DocumentHandlerDeps,
): Promise<void> {
  const downloadFile = deps.downloadFile ?? downloadTelegramFile;
  const getCapabilities = deps.getModelCapabilities ?? getModelCapabilities;
  const getStored = deps.getStoredModel ?? getStoredModel;
  const processPrompt = deps.processPrompt ?? processUserPrompt;

  const doc = ctx.message?.document || ctx.message?.video || ctx.message?.animation;
  if (!doc) {
    return;
  }

  flushPendingPrompt(ctx.chat!.id);

  const caption = ctx.message.caption || "";
  const mimeType = doc.mime_type || ("duration" in doc ? "video/mp4" : "");
  const filename =
    ("file_name" in doc && doc.file_name)
      ? doc.file_name
      : ("duration" in doc ? "video.mp4" : "document");
  const submitPrompt = async (
    text: string,
    fileParts: FilePartInput[] = [],
    mediaBytes: number | undefined = 0,
  ): Promise<void> => {
    const input = createIncomingPrompt(text, { fileParts });
    if (
      await tryEnqueuePromptIfBusy(ctx, {
        ...input,
        displayText: caption.trim() || filename,
        mediaBytes,
      })
    ) {
      return;
    }
    await processPrompt(ctx, input, deps);
  };

  try {
    if (isTextMimeType(mimeType, filename)) {
      await ctx.reply(t("bot.file_downloading"));
      if (await rejectQueuedMediaBeforePreparation(ctx, doc.file_size)) {
        return;
      }
      const downloadedFile = await downloadFile(ctx.api, doc.file_id);

      if (isFileSizeAllowed(doc.file_size, config.files.maxFileSizeKb)) {
        const textContent = downloadedFile.buffer.toString("utf-8");
        const promptWithFile = `--- Content of ${filename} ---\n${textContent}\n--- End of file ---\n\n${caption}`;
        logger.info(
          `[Document] Sending text file (${downloadedFile.buffer.length} bytes, ${filename}) as prompt`,
        );
        await submitPrompt(promptWithFile, [], doc.file_size);
        return;
      }

      // Large text file: attach as file part
      const dataUri = toDataUri(downloadedFile.buffer, mimeType || "text/plain");
      const filePart: FilePartInput = {
        type: "file",
        mime: mimeType || "text/plain",
        filename: filename,
        url: dataUri,
      };
      logger.info(
        `[Document] Sending large text file (${downloadedFile.buffer.length} bytes, ${filename}) as file attachment`,
      );
      await submitPrompt(caption || `Attached file: ${filename}`, [filePart], doc.file_size);
      return;
    }

    if (mimeType.startsWith("image/")) {
      const storedModel = getStored();
      const capabilities = await getCapabilities(storedModel.providerID, storedModel.modelID);

      if (!supportsInput(capabilities, "image")) {
        logger.warn(
          `[Document] Model ${storedModel.providerID}/${storedModel.modelID} doesn't support image input`,
        );
        await ctx.reply(t("bot.photo_model_no_image"));

        if (caption.trim().length > 0) {
          await submitPrompt(caption);
        }
        return;
      }

      await ctx.reply(t("bot.file_downloading"));
      if (await rejectQueuedMediaBeforePreparation(ctx, doc.file_size)) {
        return;
      }
      const downloadedFile = await downloadFile(ctx.api, doc.file_id);

      const dataUri = toDataUri(downloadedFile.buffer, mimeType);

      const filePart: FilePartInput = {
        type: "file",
        mime: mimeType,
        filename: filename,
        url: dataUri,
      };

      logger.info(
        `[Document] Sending image (${downloadedFile.buffer.length} bytes, ${filename}, ${mimeType}) with prompt`,
      );

      await submitPrompt(caption, [filePart], doc.file_size);
      return;
    }

    const DOCUMENT_MIME_TYPES = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.presentation",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/rtf",
    ];

    if (DOCUMENT_MIME_TYPES.includes(mimeType)) {
      const storedModel = getStored();
      const capabilities = await getCapabilities(storedModel.providerID, storedModel.modelID);

      if (!supportsInput(capabilities, "pdf")) {
        if (isDocExtractorConfigured()) {
          logger.warn(
            `[Document] Model doesn't support PDF input, delegating document to DOC_EXTRACTOR_URL`,
          );
          await ctx.reply(t("bot.file_downloading"));
          if (await rejectQueuedMediaBeforePreparation(ctx, doc.file_size)) {
            return;
          }
          const downloadedFile = await downloadFile(ctx.api, doc.file_id);

          try {
            const result = await extractDocument(downloadedFile.buffer, mimeType, filename);
            const promptWithFile = `--- Content of ${filename} ---\n${result.text}\n--- End of file ---\n\n${caption}`;
            logger.info(
              `[Document] Sending extracted document text from ${filename} (${result.text.length} chars) as prompt`,
            );
            await submitPrompt(promptWithFile, [], doc.file_size);
          } catch (extractErr) {
            const errMsg = extractErr instanceof Error ? extractErr.message : String(extractErr);
            logger.error(`[Document] Document extraction failed: ${errMsg}`);
            await ctx.reply(t("bot.document_extraction_error"));
            if (caption.trim().length > 0) {
              await submitPrompt(caption);
            }
          }
        } else {
          logger.warn(
            `[Document] Model doesn't support PDF input and DOC_EXTRACTOR_URL is not configured`,
          );
          await ctx.reply(t("bot.model_no_pdf"));
          if (caption.trim().length > 0) {
            await submitPrompt(caption);
          }
        }
        return;
      }

      await ctx.reply(t("bot.file_downloading"));
      if (await rejectQueuedMediaBeforePreparation(ctx, doc.file_size)) {
        return;
      }
      const downloadedFile = await downloadFile(ctx.api, doc.file_id);

      const dataUri = toDataUri(downloadedFile.buffer, mimeType);

      const filePart: FilePartInput = {
        type: "file",
        mime: mimeType,
        filename: filename,
        url: dataUri,
      };

      logger.info(
        `[Document] Sending document (${downloadedFile.buffer.length} bytes, ${filename}, ${mimeType}) with prompt`,
      );

      await submitPrompt(caption, [filePart], doc.file_size);
      return;
    }

    // Fallback for all other media / document formats (audio, video, binary, archives, etc.)
    await ctx.reply(t("bot.file_downloading"));
    if (await rejectQueuedMediaBeforePreparation(ctx, doc.file_size)) {
      return;
    }
    const downloadedFile = await downloadFile(ctx.api, doc.file_id);

    // If file content is valid text (e.g. m3u8, custom scripts, playlists):
    if (isTextBuffer(downloadedFile.buffer)) {
      const textContent = downloadedFile.buffer.toString("utf-8");
      const promptWithFile = `--- Content of ${filename} ---\n${textContent}\n--- End of file ---\n\n${caption}`;
      logger.info(
        `[Document] Sending text-detected file (${downloadedFile.buffer.length} bytes, ${filename}) as prompt`,
      );
      await submitPrompt(promptWithFile, [], doc.file_size);
      return;
    }

    // Binary / media file: send as FilePartInput to OpenCode
    const effectiveMime = mimeType || "application/octet-stream";
    const dataUri = toDataUri(downloadedFile.buffer, effectiveMime);
    const filePart: FilePartInput = {
      type: "file",
      mime: effectiveMime,
      filename: filename,
      url: dataUri,
    };

    logger.info(
      `[Document] Sending file attachment (${downloadedFile.buffer.length} bytes, ${filename}, ${effectiveMime}) with prompt`,
    );

    await submitPrompt(caption || `Attached file: ${filename}`, [filePart], doc.file_size);
    return;
  } catch (err) {
    logger.error("[Document] Error handling document message:", err);
    await ctx.reply(t("bot.file_download_error"));
  }
}

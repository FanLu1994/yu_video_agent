import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  CreateVoiceCloneRequest,
  VoiceProfile,
} from "@/domain/voice/types";
import { JsonFileStore } from "@/services/storage/json-file-store";
import { getDataRootPath } from "@/services/storage/runtime-paths";
import type { ProviderConfigService } from "../provider/provider-config.service";
import { MiniMaxClient } from "./minimax-client";

interface VoicesDb {
  voices: VoiceProfile[];
}

const VALID_AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav"]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const HEX_AUDIO_REGEX = /^[0-9a-fA-F]+$/;
const LEADING_HEX_PREFIX_REGEX = /^0x/i;

export class VoiceCloneService {
  private readonly db = new JsonFileStore<VoicesDb>("voices.json", {
    voices: [],
  });
  private readonly providers: ProviderConfigService;

  constructor(providers: ProviderConfigService) {
    this.providers = providers;
  }

  async listVoices(): Promise<VoiceProfile[]> {
    const data = await this.db.read();
    const hydratedVoices = await this.hydrateVoiceProfiles(data.voices);
    return hydratedVoices.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  async getVoice(voiceId: string): Promise<VoiceProfile | undefined> {
    const voices = await this.listVoices();
    return voices.find((voice) => voice.voiceId === voiceId);
  }

  private async validateAudioFile(filePath: string, label: string) {
    const extension = path.extname(filePath).toLowerCase();
    if (!VALID_AUDIO_EXTENSIONS.has(extension)) {
      throw new Error(
        `${label} format is invalid. Supported: ${Array.from(
          VALID_AUDIO_EXTENSIONS
        ).join(", ")}`
      );
    }

    const fileStats = await stat(filePath);
    if (fileStats.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`${label} is too large. Maximum size is 20MB.`);
    }
  }

  private getVoiceWorkspace(voiceId: string) {
    return path.join(getDataRootPath(), "voice", voiceId);
  }

  private resolvePreviewAudioExtension(format?: string) {
    const normalized = format?.trim().toLowerCase();
    switch (normalized) {
      case "wav":
        return ".wav";
      case "aac":
        return ".aac";
      case "flac":
        return ".flac";
      case "ogg":
        return ".ogg";
      default:
        return ".mp3";
    }
  }

  private extractSynthesizeAudioHex(
    synthesizeResponse: Record<string, unknown>
  ) {
    const data = this.asRecord(synthesizeResponse.data);
    const extraInfo = this.asRecord(synthesizeResponse.extra_info);
    const audioHex = typeof data?.audio === "string" ? data.audio.trim() : "";
    if (!audioHex) {
      throw new Error("MiniMax t2a_v2 response missing data.audio.");
    }
    const normalizedHex = audioHex.replace(LEADING_HEX_PREFIX_REGEX, "");
    if (!HEX_AUDIO_REGEX.test(normalizedHex)) {
      throw new Error("MiniMax t2a_v2 returned non-hex audio payload.");
    }
    if (normalizedHex.length % 2 !== 0) {
      throw new Error("MiniMax t2a_v2 returned invalid hex audio length.");
    }

    const audioFormat =
      typeof extraInfo?.audio_format === "string"
        ? extraInfo.audio_format
        : "mp3";

    return {
      audioFormat,
      audioHex: normalizedHex,
    };
  }

  private async persistGeneratedPreviewAudio(
    voiceId: string,
    audioHex: string,
    audioFormat?: string
  ) {
    const workspace = this.getVoiceWorkspace(voiceId);
    await mkdir(workspace, { recursive: true });

    const extension = this.resolvePreviewAudioExtension(audioFormat);
    const previewAudioPath = path.join(workspace, `preview${extension}`);
    const previewAudioBuffer = Buffer.from(audioHex, "hex");
    await writeFile(previewAudioPath, previewAudioBuffer);

    return {
      previewAudioPath,
      previewAudioUrl: pathToFileURL(previewAudioPath).toString(),
    };
  }

  private pickStringValue(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private extractPreviewAudioUrl(cloneResponse: Record<string, unknown>) {
    const candidateKeys = [
      "audio_file",
      "audio_url",
      "preview_audio_url",
      "audioFile",
      "audioUrl",
      "url",
    ];

    const direct = this.pickStringValue(cloneResponse, candidateKeys);
    if (direct) {
      return direct;
    }

    const nestedCandidates = [
      this.asRecord(cloneResponse.data),
      this.asRecord(cloneResponse.output),
      this.asRecord(cloneResponse.result),
    ];

    for (const nested of nestedCandidates) {
      if (!nested) {
        continue;
      }
      const nestedUrl = this.pickStringValue(nested, candidateKeys);
      if (nestedUrl) {
        return nestedUrl;
      }

      const audioRecord = this.asRecord(nested.audio);
      if (audioRecord) {
        const audioUrl = this.pickStringValue(audioRecord, [
          "url",
          "audio_url",
        ]);
        if (audioUrl) {
          return audioUrl;
        }
      }
    }

    const audios = cloneResponse.audios;
    if (Array.isArray(audios)) {
      for (const item of audios) {
        const record = this.asRecord(item);
        if (!record) {
          continue;
        }
        const arrayUrl = this.pickStringValue(record, ["url", "audio_url"]);
        if (arrayUrl) {
          return arrayUrl;
        }
      }
    }

    return undefined;
  }

  private async extractPreviewFromSnapshot(snapshotPath: string) {
    try {
      const raw = await readFile(snapshotPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const parsedRecord = this.asRecord(parsed);
      if (!parsedRecord) {
        return undefined;
      }

      const cloneResponseRecord =
        this.asRecord(parsedRecord.cloneResponse) ?? parsedRecord;
      return this.extractPreviewAudioUrl(cloneResponseRecord);
    } catch {
      return undefined;
    }
  }

  private async hydrateVoiceProfiles(voices: VoiceProfile[]) {
    let changed = false;

    const nextVoices = await Promise.all(
      voices.map(async (voice) => {
        const displayName = voice.displayName?.trim() || voice.voiceId;
        let nextVoice = voice;

        if (displayName !== voice.displayName) {
          nextVoice = {
            ...nextVoice,
            displayName,
          };
          changed = true;
        }

        if (!voice.previewAudioUrl && voice.rawResponseSnapshotPath) {
          const previewAudioUrl = await this.extractPreviewFromSnapshot(
            voice.rawResponseSnapshotPath
          );
          if (previewAudioUrl) {
            nextVoice = {
              ...nextVoice,
              previewAudioUrl,
            };
            changed = true;
          }
        }

        return nextVoice;
      })
    );

    if (changed) {
      await this.db.write({
        voices: nextVoices,
      });
    }

    return nextVoices;
  }

  private formatMiniMaxError(stage: string, error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = rawMessage.toLowerCase();
    const hints: string[] = [];

    if (message.includes("internal server error")) {
      hints.push("克隆音频建议使用 10 秒到 5 分钟的 mp3/m4a/wav 文件。");
      hints.push(
        "请尝试更换音频后重试，或检查 provider 的 model 是否为 speech 系列。"
      );
    }

    if (message.includes("401") || message.includes("403")) {
      hints.push("请检查 MiniMax API Key 是否正确且可用。");
    }

    if (message.includes("429")) {
      hints.push("可能触发了频率限制，请稍后重试。");
    }

    if (message.includes("t2a_v2")) {
      hints.push(
        "这是试听生成阶段失败，可检查 sampleText、voice_id 和模型配置。"
      );
    }

    if (hints.length === 0) {
      return `MiniMax ${stage}失败：${rawMessage}`;
    }

    return `MiniMax ${stage}失败：${rawMessage}（${hints.join(" ")}）`;
  }

  private async persistVoiceAssets(
    request: CreateVoiceCloneRequest,
    rawResponse: unknown
  ) {
    const workspace = this.getVoiceWorkspace(request.voiceId);
    await mkdir(workspace, { recursive: true });

    const sourcePath = path.join(
      workspace,
      `source${path.extname(request.cloneAudioPath).toLowerCase()}`
    );
    await copyFile(request.cloneAudioPath, sourcePath);

    let promptPath: string | undefined;
    if (request.promptAudioPath) {
      promptPath = path.join(
        workspace,
        `prompt${path.extname(request.promptAudioPath).toLowerCase()}`
      );
      await copyFile(request.promptAudioPath, promptPath);
    }

    const rawResponseSnapshotPath = path.join(workspace, "raw-response.json");
    await writeFile(
      rawResponseSnapshotPath,
      JSON.stringify(rawResponse, null, 2),
      "utf-8"
    );

    return {
      sourcePath,
      promptPath,
      rawResponseSnapshotPath,
    };
  }

  async createVoiceClone(
    request: CreateVoiceCloneRequest
  ): Promise<VoiceProfile> {
    const normalizedRequest: CreateVoiceCloneRequest = {
      providerId: request.providerId.trim(),
      voiceId: request.voiceId.trim(),
      cloneAudioPath: request.cloneAudioPath.trim(),
      promptAudioPath: request.promptAudioPath?.trim() || undefined,
      promptText: request.promptText?.trim() || undefined,
      sampleText: request.sampleText.trim(),
      model: request.model.trim(),
    };

    if (
      !(
        normalizedRequest.providerId &&
        normalizedRequest.voiceId &&
        normalizedRequest.cloneAudioPath &&
        normalizedRequest.sampleText &&
        normalizedRequest.model
      )
    ) {
      throw new Error(
        "providerId, voiceId, cloneAudioPath, sampleText and model are required."
      );
    }

    const hasPromptAudio = Boolean(normalizedRequest.promptAudioPath);
    const hasPromptText = Boolean(normalizedRequest.promptText);
    if (hasPromptAudio !== hasPromptText) {
      throw new Error(
        "promptAudioPath and promptText must be provided together."
      );
    }

    await this.validateAudioFile(
      normalizedRequest.cloneAudioPath,
      "cloneAudio"
    );
    if (normalizedRequest.promptAudioPath) {
      await this.validateAudioFile(
        normalizedRequest.promptAudioPath,
        "promptAudio"
      );
    }

    const provider = await this.providers.getProviderById(
      normalizedRequest.providerId
    );
    if (!provider) {
      throw new Error(`Provider '${normalizedRequest.providerId}' not found.`);
    }
    if (!provider.baseUrl) {
      throw new Error(
        `Provider '${normalizedRequest.providerId}' baseUrl is missing.`
      );
    }
    const apiKey = await this.providers.getApiKey(normalizedRequest.providerId);
    if (!apiKey) {
      throw new Error(
        `Provider '${normalizedRequest.providerId}' apiKey is missing.`
      );
    }

    const minimaxClient = new MiniMaxClient(provider.baseUrl, apiKey);
    const cloneUpload = await minimaxClient
      .uploadAudio(normalizedRequest.cloneAudioPath, "voice_clone")
      .catch((error) => {
        throw new Error(this.formatMiniMaxError("上传克隆音频", error));
      });

    let promptUpload:
      | {
          fileId: string;
          raw: unknown;
        }
      | undefined;
    if (normalizedRequest.promptAudioPath) {
      try {
        promptUpload = await minimaxClient.uploadAudio(
          normalizedRequest.promptAudioPath,
          "prompt_audio"
        );
      } catch (error) {
        throw new Error(this.formatMiniMaxError("上传参考音频", error));
      }
    }

    let cloneResponse: Record<string, unknown>;
    try {
      cloneResponse = await minimaxClient.cloneVoice({
        file_id: cloneUpload.fileId,
        voice_id: normalizedRequest.voiceId,
        text: normalizedRequest.sampleText,
        model: normalizedRequest.model,
        clone_prompt: promptUpload
          ? {
              prompt_audio: promptUpload.fileId,
              prompt_text: normalizedRequest.promptText ?? "",
            }
          : undefined,
      });
    } catch (error) {
      throw new Error(this.formatMiniMaxError("音色克隆", error));
    }

    let synthesizeResponse: Record<string, unknown>;
    try {
      synthesizeResponse = await minimaxClient.synthesizeSpeech({
        model: normalizedRequest.model,
        text: normalizedRequest.sampleText,
        voice_id: normalizedRequest.voiceId,
      });
    } catch (error) {
      throw new Error(this.formatMiniMaxError("试听生成", error));
    }

    let previewGenerated:
      | {
          previewAudioPath: string;
          previewAudioUrl: string;
        }
      | undefined;
    try {
      const synthesizedAudio =
        this.extractSynthesizeAudioHex(synthesizeResponse);
      previewGenerated = await this.persistGeneratedPreviewAudio(
        normalizedRequest.voiceId,
        synthesizedAudio.audioHex,
        synthesizedAudio.audioFormat
      );
    } catch (error) {
      throw new Error(this.formatMiniMaxError("试听音频落盘", error));
    }

    const persisted = await this.persistVoiceAssets(normalizedRequest, {
      cloneUpload: cloneUpload.raw,
      promptUpload: promptUpload?.raw,
      cloneResponse,
      synthesizeResponse,
    });

    const profile: VoiceProfile = {
      voiceId: normalizedRequest.voiceId,
      displayName: normalizedRequest.voiceId,
      providerId: normalizedRequest.providerId,
      status: "ready",
      sourceAudioPath: persisted.sourcePath,
      promptAudioPath: persisted.promptPath,
      previewAudioPath: previewGenerated?.previewAudioPath,
      previewAudioUrl: previewGenerated?.previewAudioUrl,
      rawResponseSnapshotPath: persisted.rawResponseSnapshotPath,
      createdAt: new Date().toISOString(),
    };

    await this.db.update((prev) => {
      const existing = prev.voices.find(
        (voice) => voice.voiceId === profile.voiceId
      );
      const nextVoices = existing
        ? prev.voices.map((voice) =>
            voice.voiceId === profile.voiceId ? profile : voice
          )
        : [...prev.voices, profile];

      return {
        ...prev,
        voices: nextVoices,
      };
    });

    return profile;
  }

  async updateVoiceDisplayName(
    voiceId: string,
    displayName: string
  ): Promise<VoiceProfile> {
    const normalizedVoiceId = voiceId.trim();
    const normalizedDisplayName = displayName.trim();

    if (!normalizedVoiceId) {
      throw new Error("voiceId is required.");
    }
    if (!normalizedDisplayName) {
      throw new Error("displayName is required.");
    }

    let updatedVoice: VoiceProfile | undefined;

    await this.db.update((prev) => {
      const nextVoices = prev.voices.map((voice) => {
        if (voice.voiceId !== normalizedVoiceId) {
          return voice;
        }

        updatedVoice = {
          ...voice,
          displayName: normalizedDisplayName,
        };

        return updatedVoice;
      });

      return {
        ...prev,
        voices: nextVoices,
      };
    });

    if (!updatedVoice) {
      throw new Error(`Voice '${normalizedVoiceId}' not found.`);
    }

    return updatedVoice;
  }

  async synthesizePreviewVoice(
    voiceId: string,
    text: string
  ): Promise<{ previewAudioUrl: string }> {
    if (!(voiceId && text)) {
      throw new Error("voiceId and text are required.");
    }

    const voice = await this.getVoice(voiceId);
    if (!voice) {
      throw new Error(`Voice '${voiceId}' not found.`);
    }

    const provider = await this.providers.getProviderById(voice.providerId);
    if (!provider) {
      throw new Error(`Provider '${voice.providerId}' not found.`);
    }
    if (!provider.baseUrl) {
      throw new Error(`Provider '${voice.providerId}' baseUrl is missing.`);
    }
    const apiKey = await this.providers.getApiKey(voice.providerId);
    if (!apiKey) {
      throw new Error(`Provider '${voice.providerId}' apiKey is missing.`);
    }

    const minimaxClient = new MiniMaxClient(provider.baseUrl, apiKey);
    const model = provider.model?.trim() || "speech-2.8-hd";

    let synthesizeResponse: Record<string, unknown>;
    try {
      synthesizeResponse = await minimaxClient.synthesizeSpeech({
        model,
        text,
        voice_id: voiceId,
      });
    } catch (error) {
      throw new Error(this.formatMiniMaxError("试听生成", error));
    }

    const synthesizedAudio = this.extractSynthesizeAudioHex(synthesizeResponse);

    // 使用固定文件名，覆盖之前的试听音频
    const previewGenerated = await this.persistGeneratedPreviewAudio(
      `${voiceId}_preview`,
      synthesizedAudio.audioHex,
      synthesizedAudio.audioFormat
    );

    // 保存试听元数据到数据库
    await this.updateVoicePreviewMetadata(voiceId, {
      previewText: text,
      previewAudioPath: previewGenerated.previewAudioPath,
      previewAudioUrl: previewGenerated.previewAudioUrl,
      previewUpdatedAt: new Date().toISOString(),
    });

    return { previewAudioUrl: previewGenerated.previewAudioUrl };
  }

  private async updateVoicePreviewMetadata(
    voiceId: string,
    metadata: {
      previewText?: string;
      previewAudioPath?: string;
      previewAudioUrl?: string;
      previewUpdatedAt?: string;
    }
  ) {
    await this.db.update((prev) => {
      const nextVoices = prev.voices.map((voice) => {
        if (voice.voiceId !== voiceId) {
          return voice;
        }
        return {
          ...voice,
          ...metadata,
        };
      });

      return {
        ...prev,
        voices: nextVoices,
      };
    });
  }

  async getCachedPreviewVoice(voiceId: string): Promise<{
    previewText?: string;
    previewAudioUrl?: string;
    previewUpdatedAt?: string;
  } | null> {
    const voice = await this.getVoice(voiceId);
    if (!voice) {
      return null;
    }

    // 检查是否有缓存的试听元数据
    const previewText = voice.previewText;
    const previewAudioUrl = voice.previewAudioUrl;
    const previewUpdatedAt = voice.previewUpdatedAt;

    if (!(previewAudioUrl && previewText)) {
      return null;
    }

    // 验证文件是否还存在
    const previewAudioPath = voice.previewAudioPath;
    if (previewAudioPath) {
      try {
        await stat(previewAudioPath);
      } catch {
        // 文件不存在，返回null
        return null;
      }
    }

    return {
      previewText,
      previewAudioUrl,
      previewUpdatedAt,
    };
  }
}

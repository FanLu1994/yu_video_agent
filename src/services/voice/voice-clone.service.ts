import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
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

export class VoiceCloneService {
  private readonly db = new JsonFileStore<VoicesDb>("voices.json", {
    voices: [],
  });

  constructor(private readonly providers: ProviderConfigService) {}

  async listVoices(): Promise<VoiceProfile[]> {
    const data = await this.db.read();
    return data.voices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  async createVoiceClone(request: CreateVoiceCloneRequest): Promise<VoiceProfile> {
    await this.validateAudioFile(request.cloneAudioPath, "cloneAudio");
    if (request.promptAudioPath) {
      await this.validateAudioFile(request.promptAudioPath, "promptAudio");
    }

    const provider = await this.providers.getProviderById(request.providerId);
    if (!provider) {
      throw new Error(`Provider '${request.providerId}' not found.`);
    }
    if (!provider.baseUrl) {
      throw new Error(`Provider '${request.providerId}' baseUrl is missing.`);
    }
    const apiKey = await this.providers.getApiKey(request.providerId);
    if (!apiKey) {
      throw new Error(`Provider '${request.providerId}' apiKey is missing.`);
    }

    const minimaxClient = new MiniMaxClient(provider.baseUrl, apiKey);
    const cloneUpload = await minimaxClient.uploadAudio(
      request.cloneAudioPath,
      "voice_clone"
    );

    let promptUpload:
      | {
          fileId: string;
          raw: unknown;
        }
      | undefined;
    if (request.promptAudioPath) {
      promptUpload = await minimaxClient.uploadAudio(
        request.promptAudioPath,
        "prompt_audio"
      );
    }

    const cloneResponse = await minimaxClient.cloneVoice({
      file_id: cloneUpload.fileId,
      voice_id: request.voiceId,
      text: request.sampleText,
      model: request.model,
      clone_prompt: promptUpload
        ? {
            prompt_audio: promptUpload.fileId,
            prompt_text: request.promptText ?? "",
          }
        : undefined,
    });

    const persisted = await this.persistVoiceAssets(request, {
      cloneUpload: cloneUpload.raw,
      promptUpload: promptUpload?.raw,
      cloneResponse,
    });

    const previewAudioUrl =
      typeof cloneResponse.audio_file === "string"
        ? cloneResponse.audio_file
        : undefined;

    const profile: VoiceProfile = {
      voiceId: request.voiceId,
      providerId: request.providerId,
      status: "ready",
      sourceAudioPath: persisted.sourcePath,
      promptAudioPath: persisted.promptPath,
      previewAudioUrl,
      rawResponseSnapshotPath: persisted.rawResponseSnapshotPath,
      createdAt: new Date().toISOString(),
    };

    await this.db.update((prev) => {
      const existing = prev.voices.find((voice) => voice.voiceId === profile.voiceId);
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
}

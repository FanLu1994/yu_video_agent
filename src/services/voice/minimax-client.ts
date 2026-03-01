import { readFile } from "node:fs/promises";
import path from "node:path";

export type MiniMaxUploadPurpose = "voice_clone" | "prompt_audio";
const TRAILING_SLASHES_REGEX = /\/+$/;

export interface MiniMaxClonePayload {
  clone_prompt?: {
    prompt_audio: string;
    prompt_text: string;
  };
  file_id: string;
  model: string;
  text: string;
  voice_id: string;
}

export interface MiniMaxSynthesizePayload {
  model: string;
  text: string;
  voice_id: string;
}

interface MiniMaxUploadResponse {
  file?: {
    file_id?: string;
  };
  file_id?: string;
}

function mimeFromExtension(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

export class MiniMaxClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private buildV1Endpoint(pathWithoutLeadingSlash: string) {
    const normalizedBase = this.baseUrl.replace(TRAILING_SLASHES_REGEX, "");
    if (normalizedBase.endsWith("/v1")) {
      return `${normalizedBase}/${pathWithoutLeadingSlash}`;
    }
    return `${normalizedBase}/v1/${pathWithoutLeadingSlash}`;
  }

  private async parseJsonResponse(response: Response) {
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      const payload = await this.parseJsonResponse(response);
      const baseResp =
        payload.base_resp &&
        typeof payload.base_resp === "object" &&
        !Array.isArray(payload.base_resp)
          ? (payload.base_resp as Record<string, unknown>)
          : undefined;
      let statusMessage: string | undefined;
      if (typeof baseResp?.status_msg === "string") {
        statusMessage = baseResp.status_msg;
      } else if (typeof payload.message === "string") {
        statusMessage = payload.message;
      }
      throw new Error(
        `MiniMax API request failed (${response.status})` +
          (statusMessage ? `: ${statusMessage}` : "") +
          `; payload=${JSON.stringify(payload)}`
      );
    }

    return this.parseJsonResponse(response);
  }

  async uploadAudio(filePath: string, purpose: MiniMaxUploadPurpose) {
    const fileBuffer = await readFile(filePath);
    const blob = new Blob([fileBuffer], { type: mimeFromExtension(filePath) });
    const formData = new FormData();
    formData.append("purpose", purpose);
    formData.append("file", blob, path.basename(filePath));

    const response = await fetch(this.buildV1Endpoint("files/upload"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    const data = (await this.handleResponse(response)) as MiniMaxUploadResponse;
    const fileId = data.file?.file_id ?? data.file_id;
    if (!fileId) {
      throw new Error("MiniMax upload response does not contain file_id.");
    }

    return {
      fileId,
      raw: data,
    };
  }

  async cloneVoice(payload: MiniMaxClonePayload) {
    const response = await fetch(this.buildV1Endpoint("voice_clone"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await this.handleResponse(response);
    return data;
  }

  async synthesizeSpeech(payload: MiniMaxSynthesizePayload) {
    const response = await fetch(this.buildV1Endpoint("t2a_v2"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: payload.model,
        text: payload.text,
        stream: false,
        voice_setting: {
          voice_id: payload.voice_id,
          speed: 1,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32_000,
          bitrate: 128_000,
          format: "mp3",
          channel: 1,
        },
        subtitle_enable: false,
      }),
    });

    const data = await this.handleResponse(response);
    return data;
  }
}

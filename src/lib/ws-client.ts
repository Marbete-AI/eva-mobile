/**
 * EVA WebSocket session client.
 * Manages the persistent WS connection to the backend /session endpoint.
 * Handles reconnection, ping/keepalive, and message dispatch.
 *
 * Week 2: text-based. Week 5+: voice streams added.
 */
import Config from "react-native-config";

const API_URL = Config.API_URL ?? "http://localhost:8787";

// Convert http(s) → ws(s)
function toWsUrl(base: string): string {
  return base.replace(/^http/, "ws");
}

export type ServerMessage =
  | { type: "session_started"; sessionId: string; driverId: string }
  | { type: "eva_response"; text: string; requestId: string; trigger: string }
  | { type: "eva_audio"; audioBase64: string; requestId: string }
  | { type: "asr_transcript"; transcript: string; confidence: number }
  | { type: "asr_partial"; partial: string }
  | { type: "asr_empty" }
  | { type: "cancelled" }
  | { type: "listening_started" }
  | { type: "listening_stopped" }
  | { type: "context_update"; metrics: unknown; mode: string }
  | { type: "error"; message: string };

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WsClientOptions {
  driverId?: string;
  onMessage: (msg: ServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

export class EvaWsClient {
  private ws: WebSocket | null = null;
  private opts: WsClientOptions;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: WsClientOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.stopped) return;
    this.opts.onStatusChange("connecting");

    const wsBase = toWsUrl(API_URL);
    const url = this.opts.driverId
      ? `${wsBase}/session?driverId=${encodeURIComponent(this.opts.driverId)}`
      : `${wsBase}/session`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.opts.onStatusChange("connected");
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          this.opts.onMessage(msg);
        } catch {
          // Malformed — ignore
        }
      };

      this.ws.onerror = () => {
        this.opts.onStatusChange("error");
      };

      this.ws.onclose = () => {
        this.stopPing();
        if (!this.stopped) {
          this.opts.onStatusChange("disconnected");
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };
    } catch {
      this.opts.onStatusChange("error");
    }
  }

  sendVoiceInput(transcript: string, confidence = 1.0): void {
    this.send({ type: "voice_input", transcript, confidence });
  }

  sendAudioInput(audioBase64: string, mimeType = "audio/wav"): void {
    this.send({ type: "audio_input", audioBase64, mimeType });
  }

  sendCancel(): void {
    this.send({ type: "cancel" });
  }

  sendAudioStreamChunk(audioBase64: string): void {
    this.send({ type: "audio_stream_chunk", audioBase64 });
  }

  sendStartListening(): void {
    this.send({ type: "start_listening" });
  }

  sendStopListening(): void {
    this.send({ type: "stop_listening" });
  }

  sendFeedback(
    feedbackType: string,
    content?: string,
    referenceMessageId?: string
  ): void {
    this.send({ type: "feedback", feedbackType, content, referenceMessageId });
  }

  sendModeChange(mode: string): void {
    this.send({ type: "mode_change", mode });
  }

  disconnect(): void {
    this.stopped = true;
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
  }
}

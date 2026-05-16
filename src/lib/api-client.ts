import Config from "react-native-config";

const API_URL = Config.API_URL ?? "http://localhost:8787";

export interface ChatResponse {
  response: string;
  requestId: string;
  sessionId: string;
}

export interface ChatError {
  error: string;
  details?: unknown;
}

/**
 * HTTP fallback — used when WebSocket is unavailable.
 * Primary path is WS /session.
 */
export async function sendMessage(message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as ChatError;
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<ChatResponse>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ── SmartCar ──────────────────────────────────────────────────────────────────

/**
 * Returns the SmartCar Connect OAuth URL for the given driver.
 * Open this URL in the system browser to start the vehicle connect flow.
 */
export async function getSmartcarAuthUrl(driverId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/smartcar/auth?userId=${encodeURIComponent(driverId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { authUrl?: string };
    return data.authUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns whether the driver has connected their vehicle via SmartCar.
 */
export async function getSmartcarStatus(driverId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/smartcar/status?userId=${encodeURIComponent(driverId)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as { connected?: boolean };
    return data.connected ?? false;
  } catch {
    return false;
  }
}

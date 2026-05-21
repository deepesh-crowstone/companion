import AsyncStorage from '@react-native-async-storage/async-storage';
import { isProductionApi, resolvedApiBaseUrl } from '../config';
import { chatMessageFromJson, ChatMessage } from '../models/ChatMessage';
import { SessionExpiredException } from './sessionExpired';

const TOKEN_KEY = 'mia_auth_token';
const USERNAME_KEY = 'mia_username';
const TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 45_000;

class ApiService {
  private token: string | null = null;
  private username: string | null = null;

  get authToken(): string | null {
    return this.token;
  }

  get currentUsername(): string | null {
    return this.username;
  }

  get isLoggedIn(): boolean {
    return this.token != null;
  }

  async loadSession(): Promise<void> {
    const [token, username] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USERNAME_KEY),
    ]);
    this.token = token;
    this.username = username;
  }

  private async saveSession(token: string, username: string): Promise<void> {
    this.token = token;
    this.username = username;
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USERNAME_KEY, username],
    ]);
  }

  async logout(): Promise<void> {
    this.token = null;
    this.username = null;
    await AsyncStorage.multiRemove([TOKEN_KEY, USERNAME_KEY]);
  }

  async validateSession(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const res = await this.get(`${resolvedApiBaseUrl()}/auth/me`, this.authHeaders);
      if (res.status === 401) {
        await this.logout();
        return false;
      }
      return res.status === 200;
    } catch (e) {
      if (e instanceof SessionExpiredException) return false;
      return this.checkHealth();
    }
  }

  async checkHealth(): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const res = await fetch(`${resolvedApiBaseUrl()}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 200) return true;
      } catch {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }
    return false;
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async register(username: string, password: string): Promise<Record<string, unknown>> {
    const res = await this.post(`${resolvedApiBaseUrl()}/auth/register`, {
      'Content-Type': 'application/json',
    }, JSON.stringify({ username, password }));
    return this.handleAuthResponse(res);
  }

  async login(username: string, password: string): Promise<Record<string, unknown>> {
    const res = await this.post(`${resolvedApiBaseUrl()}/auth/login`, {
      'Content-Type': 'application/json',
    }, JSON.stringify({ username, password }));
    return this.handleAuthResponse(res);
  }

  private async handleAuthResponse(res: Response): Promise<Record<string, unknown>> {
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status >= 400) {
      throw new Error((body.error as string) ?? 'Authentication failed');
    }
    const user = body.user as Record<string, unknown>;
    await this.saveSession(body.token as string, user.username as string);
    return body;
  }

  async fetchMessages(): Promise<ChatMessage[]> {
    const res = await this.get(`${resolvedApiBaseUrl()}/messages`, this.authHeaders);
    this.guardAuth(res);
    if (res.status >= 400) throw new Error(await this.errorFrom(res));
    const data = (await res.json()) as { messages: Record<string, unknown>[] };
    return data.messages.map(chatMessageFromJson);
  }

  async sendText(text: string): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
    const batch = await this.sendTextBatch([text]);
    return { user: batch.users[batch.users.length - 1], assistant: batch.assistant };
  }

  async sendTextBatch(texts: string[]): Promise<{ users: ChatMessage[]; assistant: ChatMessage }> {
    const res = await this.post(
      `${resolvedApiBaseUrl()}/messages/text/batch`,
      this.authHeaders,
      JSON.stringify({ texts }),
    );
    this.guardAuth(res);
    if (res.status >= 400) throw new Error(await this.errorFrom(res));
    const data = (await res.json()) as {
      userMessages: Record<string, unknown>[];
      assistantMessage: Record<string, unknown>;
    };
    return {
      users: data.userMessages.map(chatMessageFromJson),
      assistant: chatMessageFromJson(data.assistantMessage),
    };
  }

  async sendVoice(uri: string, mimeType = 'audio/m4a'): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
    const form = new FormData();
    form.append('audio', {
      uri,
      name: 'voice.m4a',
      type: mimeType,
    } as unknown as Blob);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${resolvedApiBaseUrl()}/messages/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);
      this.guardAuth(res);
      if (res.status >= 400) throw new Error(await this.errorFrom(res));
      const data = (await res.json()) as {
        userMessage: Record<string, unknown>;
        assistantMessage: Record<string, unknown>;
      };
      return {
        user: chatMessageFromJson(data.userMessage),
        assistant: chatMessageFromJson(data.assistantMessage),
      };
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof SessionExpiredException) throw e;
      throw new Error(this.connectionError(e instanceof Error ? e.message : undefined));
    }
  }

  async createRealtimeSession(): Promise<Record<string, unknown>> {
    const res = await this.post(
      `${resolvedApiBaseUrl()}/realtime/session`,
      this.authHeaders,
    );
    this.guardAuth(res);
    if (res.status >= 400) throw new Error(await this.errorFrom(res));
    return (await res.json()) as Record<string, unknown>;
  }

  private guardAuth(res: Response): void {
    if (res.status === 401) {
      void this.logout();
      throw new SessionExpiredException();
    }
  }

  private async get(url: string, headers?: Record<string, string>): Promise<Response> {
    return this.wrap(() => fetch(url, { headers }));
  }

  private async post(
    url: string,
    headers?: Record<string, string>,
    body?: string,
  ): Promise<Response> {
    return this.wrap(() => fetch(url, { method: 'POST', headers, body }));
  }

  private async wrap(request: () => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await request();
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof SessionExpiredException) throw e;
      throw new Error(this.connectionError(e instanceof Error ? e.message : undefined));
    }
  }

  private connectionError(detail?: string): string {
    const extra = detail ? `\n${detail}` : '';
    const url = resolvedApiBaseUrl();
    if (isProductionApi()) {
      return `Cannot reach server at ${url}.${extra}\n` +
        `1. On your phone browser open: ${url}/health (should show {"ok":true})\n` +
        '2. Stop the app, then run with EXPO_PUBLIC_API_BASE_URL set.\n' +
        '3. Hot reload does not change API_BASE_URL — full restart required.';
    }
    return `Cannot reach server at ${url}.${extra}\n` +
      '1. Run: cd server && npm run dev\n' +
      '2. On Mac run: ipconfig getifaddr en0\n' +
      '3. Re-run with EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_IP:3000\n' +
      '4. Phone browser should open http://YOUR_MAC_IP:3000/health';
  }

  private async errorFrom(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string };
      return body.error ?? `Request failed (${res.status})`;
    } catch {
      return `Request failed (${res.status})`;
    }
  }
}

export const apiService = new ApiService();

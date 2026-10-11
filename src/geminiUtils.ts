import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-2.5-flash";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GeminiCallOptions {
  apiKey: string;
  prompt: string;
  imageBase64?: string;
  imageMime?: string;
  jsonMode?: boolean;
  maxRetries?: number;
  thinkingBudget?: number;
}

export async function callGemini(opts: GeminiCallOptions): Promise<string> {
  const {
    apiKey, prompt, imageBase64, imageMime = "image/jpeg",
    jsonMode = false, maxRetries = 3, thinkingBudget = 0,
  } = opts;
  if (!apiKey) throw new Error("API 키가 없습니다.");

  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [{ text: prompt }];
  if (imageBase64) parts.push({ inlineData: { mimeType: imageMime, data: imageBase64 } });

  const requestConfig: any = { thinkingConfig: { thinkingBudget } };
  if (jsonMode) requestConfig.responseMimeType = "application/json";

  let lastErr: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL, contents: [{ parts }], config: requestConfig,
      });
      const text = res.text;
      if (!text || !text.trim()) throw new Error("빈 응답");
      return text;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      const isRetryable = /429|503|500|overload|quota|rate|timeout|network|fetch|deadline|unavailable|빈 응답/i.test(msg);
      if (!isRetryable || attempt === maxRetries) break;
      await sleep(800 * Math.pow(2, attempt) + Math.random() * 300);
    }
  }
  throw lastErr || new Error("Gemini 호출 실패");
}

export function safeParseJSON<T = any>(text: string): T | null {
  if (!text) return null;
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const f = cleaned.indexOf("{"), l = cleaned.lastIndexOf("}");
  if (f !== -1 && l !== -1 && l > f) { try { return JSON.parse(cleaned.slice(f, l + 1)); } catch {} }
  const fa = cleaned.indexOf("["), la = cleaned.lastIndexOf("]");
  if (fa !== -1 && la !== -1 && la > fa) { try { return JSON.parse(cleaned.slice(fa, la + 1)); } catch {} }
  return null;
}

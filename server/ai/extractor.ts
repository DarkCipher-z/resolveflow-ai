import { GoogleGenAI } from '@google/genai';
import { DocumentAnalysis, DocumentAnalysisJsonSchema } from './schemas';
import { SYSTEM_PROMPT, PROMPT_VERSION, buildUserMessage, UserMessageParams } from './prompts';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('Warning: GEMINI_API_KEY environment variable is not set');
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export interface AnalyzeDocumentOptions extends UserMessageParams {
  bytes: Buffer;
  mimeType: string;
}

export interface AnalyzeDocumentResult {
  promptVersion: string;
  modelName: string;
  raw: any;
  parsed: DocumentAnalysis | null;
  validationStatus: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

/**
 * Analyzes a merchant document using Gemini Multimodal structured output.
 * File bytes are sent directly (PDF or images) with no separate OCR.
 * Every response is re-validated with Zod (DocumentAnalysis).
 */
export async function analyzeDocument(opts: AnalyzeDocumentOptions): Promise<AnalyzeDocumentResult> {
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const modelsToTry = [primaryModel];
  if (primaryModel !== 'gemini-3.5-flash-lite') {
    modelsToTry.push('gemini-3.5-flash-lite');
  }

  const userMessage = buildUserMessage(opts);

  let lastError: any = null;
  let activeModel = primaryModel;

  for (const currentModel of modelsToTry) {
    activeModel = currentModel;
    const maxAttempts = 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const generatePromise = ai.models.generateContent({
          model: currentModel,
          contents: [
            {
              role: 'user',
              parts: [
                { text: userMessage },
                {
                  inlineData: {
                    mimeType: opts.mimeType,
                    data: opts.bytes.toString('base64'),
                  },
                },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: DocumentAnalysisJsonSchema as any,
            temperature: 0,
          },
        });

        // 6-second timeout per attempt to rapidly fall back if a model endpoint is experiencing demand spikes
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after 6s waiting for ${currentModel}`)), 6000)
        );

        const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

        const responseText = response.text ?? '{}';
        let raw: any;
        try {
          raw = JSON.parse(responseText);
        } catch (parseError: any) {
          return {
            promptVersion: PROMPT_VERSION,
            modelName: currentModel,
            raw: responseText,
            parsed: null,
            validationStatus: 'FAILED',
            errorMessage: `Failed to parse Gemini JSON output: ${parseError.message}`,
          };
        }

        // Re-validate strictly with Zod schema
        const parseResult = DocumentAnalysis.safeParse(raw);

        if (!parseResult.success) {
          const errorMsg = parseResult.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ');

          return {
            promptVersion: PROMPT_VERSION,
            modelName: currentModel,
            raw,
            parsed: null,
            validationStatus: 'FAILED',
            errorMessage: `Schema validation failed: ${errorMsg}`,
          };
        }

        return {
          promptVersion: PROMPT_VERSION,
          modelName: currentModel,
          raw,
          parsed: parseResult.data,
          validationStatus: 'SUCCESS',
        };
      } catch (err: any) {
        lastError = err;
        const isTemporary =
          err?.status === 503 ||
          err?.status === 429 ||
          err?.message?.includes('503') ||
          err?.message?.includes('high demand') ||
          err?.message?.includes('rate limit') ||
          err?.message?.includes('Timeout');

        if (isTemporary && attempt < maxAttempts) {
          const delayMs = attempt * 1500;
          console.warn(`[Gemini] Model ${currentModel} error: ${err.message}. Retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        console.warn(`[Gemini] Attempt ${attempt} on ${currentModel} failed: ${err.message}. Moving to fallback model.`);
        break;
      }
    }
  }

  console.error('Gemini extraction error after all attempts:', lastError);
  return {
    promptVersion: PROMPT_VERSION,
    modelName: activeModel,
    raw: null,
    parsed: null,
    validationStatus: 'FAILED',
    errorMessage: lastError?.message || 'Gemini API call failed',
  };
}

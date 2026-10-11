import { GoogleGenAI } from '@google/genai';
import { IAITutorProvider, StreamParams, StructuredParams } from './ai-provider.interface.js';

export class GeminiAITutorProvider implements IAITutorProvider {
  public readonly name = 'GeminiAITutorProvider';
  /** Gemini accepted inline image data. Unreachable since the migration. */
  public readonly supportsImages = true;
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = 'gemini-3.6-flash') {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  public async generateStream(params: StreamParams): Promise<string> {
    const { systemPrompt, userPrompt, history = [], images = [], onChunk } = params;

    // A part is either text or inline binary. History is always text: images
    // are never persisted, so there is nothing to replay from earlier turns.
    type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    const contents: Array<{ role: string; parts: GeminiPart[] }> = [];

    for (const msg of history) {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      });
    }

    // Current turn: the image (if any) comes first so the model has the
    // evidence in hand before it reads the question about it. Base64 is
    // produced here and nowhere else, and is never logged.
    const currentParts: GeminiPart[] = [];
    for (const image of images) {
      currentParts.push({
        inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') },
      });
    }
    currentParts.push({ text: userPrompt });

    contents.push({ role: 'user', parts: currentParts });

    let fullText = '';

    try {
      const responseStream = await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        },
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          await onChunk(text);
        }
      }

      return fullText;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[GeminiAITutorProvider] Stream error: ${errorMsg}`);
      throw err;
    }
  }

  public async generateStructured<T>(params: StructuredParams<T>): Promise<T> {
    const { systemPrompt, userPrompt, fallbackGenerator } = params;

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.3, // Lower temperature for deterministic structured extraction
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      return JSON.parse(text) as T;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[GeminiAITutorProvider] Structured generation failed (${errorMsg}), falling back if available.`);
      if (fallbackGenerator) {
        return fallbackGenerator();
      }
      throw err;
    }
  }
}

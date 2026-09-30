import { GoogleGenAI } from '@google/genai';
import { IAITutorProvider, StreamParams, StructuredParams } from './ai-provider.interface.js';

export class GeminiAITutorProvider implements IAITutorProvider {
  public readonly name = 'GeminiAITutorProvider';
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  public async generateStream(params: StreamParams): Promise<string> {
    const { systemPrompt, userPrompt, history = [], onChunk } = params;

    // Convert history into contents array formatted for @google/genai
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of history) {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      });
    }

    // Add current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: userPrompt }],
    });

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

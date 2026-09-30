export interface AIMessage {
  role: 'user' | 'model';
  text: string;
}

export interface StreamParams {
  systemPrompt: string;
  userPrompt: string;
  history?: AIMessage[];
  onChunk: (chunk: string) => Promise<void> | void;
}

export interface StructuredParams<T> {
  systemPrompt: string;
  userPrompt: string;
  schema?: unknown;
  fallbackGenerator?: () => T;
}

export interface IAITutorProvider {
  readonly name: string;
  generateStream(params: StreamParams): Promise<string>;
  generateStructured<T>(params: StructuredParams<T>): Promise<T>;
}

/** Leverantörsoberoende gränssnitt för agenten, så att Claude kan bytas mot en annan modell senare. */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  webFetches: number;
}

export interface ResearchInput {
  system: string;
  prompt: string;
  maxSearches: number;
  maxFetches: number;
  /** Ungefärlig plats för sökmotorn. */
  location?: { city?: string; country: string; timezone: string };
}

export interface LlmResult {
  text: string;
  usage: LlmUsage;
  model: string;
  stopReason: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  research(input: ResearchInput): Promise<LlmResult>;
}

export const emptyUsage = (): LlmUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, webFetches: 0 });

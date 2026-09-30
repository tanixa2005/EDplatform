import { IAITutorProvider, StreamParams, StructuredParams } from './ai-provider.interface.js';

export class MockAITutorProvider implements IAITutorProvider {
  public readonly name = 'MockAITutorProvider';

  public async generateStream(params: StreamParams): Promise<string> {
    const { systemPrompt, userPrompt, onChunk } = params;

    let responseText = '';

    // Determine context from prompts
    if (systemPrompt.includes('SOCRATIC QUIZ TUTOR')) {
      responseText = `Hello! I'm your Socratic learning assistant. Regarding your question: "${userPrompt.slice(0, 80)}..."

I can't give you the direct answer, but let's break this question down together:

1. **Focus on the core concept**: Look at the main principles discussed in this lesson. What rule or principle applies directly here?
2. **Eliminate outliers**: Read through the choices carefully. Which options contradict foundational definitions?
3. **Key clue**: Think about how state changes or execution flow happens in this specific context.

What is your immediate intuition about what this question is testing? Tell me what you think, and I'll guide you step-by-step!`;
    } else {
      responseText = `I'd be glad to help you explore: "${userPrompt.slice(0, 80)}..."

### Conceptual Breakdown

When exploring this topic in the context of your current lesson:
- **Core Principle**: Key concepts build directly upon foundational architecture.
- **Formulas & Notation**: If we consider the mathematical relation:
  \\[
  P(x) = \\sum_{i=1}^{n} w_i \\cdot x_i + b
  \\]
- **Code Example**:
  \`\`\`typescript
  // Example pattern demonstrating this concept
  export function processContext(input: string): string {
    return \`Processed: \${input.trim()}\`;
  }
  \`\`\`

### Practice Check
To verify your understanding: how would this behavior change if the initial conditions or inputs were inverted? Feel free to ask more follow-ups!`;
    }

    // Stream out chunks progressively to simulate realistic token streaming
    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
      await onChunk(chunk);
      // Brief simulated pause (15ms)
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    return responseText;
  }

  public async generateStructured<T>(params: StructuredParams<T>): Promise<T> {
    if (params.fallbackGenerator) {
      return params.fallbackGenerator();
    }
    throw new Error('Mock structured generation requires a fallback generator');
  }
}

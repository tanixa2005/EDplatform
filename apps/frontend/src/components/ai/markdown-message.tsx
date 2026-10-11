'use client';

import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Renders ED's reply as real Markdown with real maths.
 *
 * Previously the tutor stream was rendered with `whitespace-pre-wrap`, so the
 * LaTeX and Markdown the system prompt asks for reached the student as literal
 * `\(x^2\)` and `**bold**`. For a maths product aimed at 11-year-olds that is the
 * difference between usable and unusable.
 *
 * `remark-math` + `rehype-katex` handle $inline$ and $$display$$. LaTeX
 * delimiters are also normalised below, because models emit \( \) and \[ \] about
 * as often as dollar signs.
 */
function normalizeMath(input: string): string {
  return (
    input
      // \[ ... \] -> $$ ... $$
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `$$${body}$$`)
      // \( ... \) -> $ ... $
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body}$`)
  );
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  className
}: MarkdownMessageProps) {
  return (
    <div className={className ? `ed-prose ${className}` : 'ed-prose'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          // Keep every link safe to tap for a child: new tab, no referrer.
          a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
});

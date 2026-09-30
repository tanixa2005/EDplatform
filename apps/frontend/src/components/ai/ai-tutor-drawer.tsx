'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  Square
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AITutorMode } from '@edplatform/shared';
import { API_BASE_URL } from '@/lib/api';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface AITutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  lessonTitle?: string;
  mode: AITutorMode;
  questionId?: string;
  questionPrompt?: string;
}

export function AITutorDrawer({
  isOpen,
  onClose,
  lessonId,
  lessonTitle,
  mode,
  questionId,
  questionPrompt,
}: AITutorDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Reset or initialize greeting when opened with fresh context
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (mode === 'quiz') {
        setMessages([
          {
            role: 'model',
            text: `👋 Hi! I'm your **Socratic Quiz Assistant**.

I'm here to give you hints, clarify key terms, and guide your thinking **without giving away the answer**. What part of this question would you like to explore?`,
          },
        ]);
      } else {
        setMessages([
          {
            role: 'model',
            text: `👋 Hi! I'm your **AI Study Partner** for this lesson.

Ask me anything about the concepts, ask for code walkthroughs, mathematical formulas, or request custom practice questions!`,
          },
        ]);
      }
    }
  }, [isOpen, mode, messages.length]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isStreaming) return;

    setInputMessage('');
    setError(null);

    const userMessage: Message = { role: 'user', text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // Prepare model placeholder
    const modelMessage: Message = { role: 'model', text: '' };
    setMessages([...updatedMessages, modelMessage]);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/ai/tutor/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          lessonId,
          mode,
          message: text,
          questionId: mode === 'quiz' ? questionId : undefined,
          history: updatedMessages.slice(-6).map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded (20 requests/min). Please slow down and try again shortly.');
        }
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || `AI Tutor request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataContent = trimmed.slice(6);
            if (dataContent === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(dataContent);
              if (parsed.chunk) {
                streamedResponse += parsed.chunk;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    role: 'model',
                    text: streamedResponse,
                  };
                  return copy;
                });
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // ignore parse errors of individual chunks
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        // Stream aborted by user
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to communicate with AI Tutor';
      setError(message);
      setMessages((prev) => {
        // If last message was empty model message, remove it
        if (prev.length > 0 && prev[prev.length - 1].role === 'model' && prev[prev.length - 1].text === '') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-background/95 backdrop-blur shadow-2xl border-l border-border transition-all duration-300 ease-in-out">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3.5 bg-card/60">
        <div className="flex items-center space-x-2.5">
          <div
            className={`p-2 rounded-xl ${
              mode === 'quiz' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'
            }`}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-foreground">EDplatform AI Tutor</h2>
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  mode === 'quiz'
                    ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                    : 'border-primary/40 text-primary bg-primary/5'
                }`}
              >
                {mode === 'quiz' ? 'Socratic Quiz Mode' : 'Study Mode'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">
              {mode === 'quiz' && questionPrompt
                ? `Hint guide for: "${questionPrompt.slice(0, 36)}..."`
                : lessonTitle || 'Lesson Companion'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearHistory}
            title="Clear Chat"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Socratic Mode Warning Banner */}
      {mode === 'quiz' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center space-x-2 text-[12px] text-amber-700 dark:text-amber-300">
          <HelpCircle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <strong>Quiz Honor Code:</strong> Hints guide your reasoning; answers will not be disclosed.
          </span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm leading-relaxed">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-none'
                  : 'bg-card border border-border/80 text-foreground rounded-bl-none prose prose-sm dark:prose-invert'
              }`}
            >
              {msg.role === 'model' ? (
                <div className="whitespace-pre-wrap font-sans break-words space-y-2">
                  {msg.text}
                  {isStreaming && idx === messages.length - 1 && (
                    <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 px-1">
              {msg.role === 'user' ? 'You' : 'AI Tutor'}
            </span>
          </div>
        ))}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">AI Assistant Alert</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2 border-t border-border/40 bg-card/30 flex gap-1.5 overflow-x-auto no-scrollbar">
        {mode === 'quiz' ? (
          <>
            <button
              onClick={() => handleSendMessage('Can you give me a hint on this question?')}
              disabled={isStreaming}
              className="text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full whitespace-nowrap border border-border/40 transition-colors disabled:opacity-50"
            >
              💡 Give me a hint
            </button>
            <button
              onClick={() => handleSendMessage('What core concept is this question testing?')}
              disabled={isStreaming}
              className="text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full whitespace-nowrap border border-border/40 transition-colors disabled:opacity-50"
            >
              📖 Concept tested
            </button>
            <button
              onClick={() => handleSendMessage('How should I break down this problem?')}
              disabled={isStreaming}
              className="text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full whitespace-nowrap border border-border/40 transition-colors disabled:opacity-50"
            >
              🤔 Reasoning guide
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleSendMessage('Can you explain the main concept of this lesson?')}
              disabled={isStreaming}
              className="text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full whitespace-nowrap border border-border/40 transition-colors disabled:opacity-50"
            >
              💡 Explain lesson
            </button>
            <button
              onClick={() => handleSendMessage('Give me a practice challenge based on this lesson.')}
              disabled={isStreaming}
              className="text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full whitespace-nowrap border border-border/40 transition-colors disabled:opacity-50"
            >
              📝 Practice challenge
            </button>
            <button
              onClick={() => handleSendMessage('Can you provide a code example for this topic?')}
              disabled={isStreaming}
              className="text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full whitespace-nowrap border border-border/40 transition-colors disabled:opacity-50"
            >
              💻 Code example
            </button>
          </>
        )}
      </div>

      {/* Input Form */}
      <div className="p-3.5 border-t border-border bg-card/60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              mode === 'quiz'
                ? 'Ask for a hint or conceptual clarification...'
                : 'Ask a question about this lesson...'
            }
            disabled={isStreaming}
            className="flex-1 bg-background border border-input rounded-xl px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          />

          {isStreaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleStopStream}
              className="rounded-xl h-9 w-9 text-destructive border-destructive/30 hover:bg-destructive/10"
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-destructive" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!inputMessage.trim()}
              className="rounded-xl h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

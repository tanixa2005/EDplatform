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
import { getApiUrl } from '@/lib/api';

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
      const response = await fetch(getApiUrl('/ai/tutor/stream'), {
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
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-[#FFFDF8] shadow-2xl border-l border-border transition-all duration-300 ease-in-out">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-card">
        <div className="flex items-center space-x-3">
          <div
            className={`p-2.5 rounded-md shadow-xs transition-colors ${
              mode === 'quiz' ? 'bg-[#FFF3CD] text-[#7A5A00] border border-[#E7E3D8]' : 'bg-[#FDE8E7] text-primary border border-primary/20'
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-display text-sm font-bold text-foreground">EDplatform AI Tutor</h2>
              <Badge
                variant="outline"
                className={`text-[10px] font-bold uppercase tracking-wider rounded-md ${
                  mode === 'quiz'
                    ? 'border-[#E7E3D8] text-[#7A5A00] bg-[#FFF3CD]/50'
                    : 'border-primary/30 text-primary bg-[#FDE8E7]'
                }`}
              >
                {mode === 'quiz' ? 'Socratic Quiz Mode' : 'Study Companion'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate max-w-[270px] mt-0.5">
              {mode === 'quiz' && questionPrompt
                ? `Hint guide for: "${questionPrompt.slice(0, 32)}..."`
                : lessonTitle || 'Lesson Guidance & Exercises'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearHistory}
            title="Clear Chat"
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-md"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-md"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Socratic Mode Warning Banner */}
      {mode === 'quiz' && (
        <div className="bg-[#FFF3CD]/60 border-b border-[#E7E3D8] px-5 py-2.5 flex items-center space-x-2 text-xs text-[#7A5A00]">
          <HelpCircle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>
            <strong>Quiz Honor Code:</strong> Hints encourage reasoning without revealing answers.
          </span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm leading-relaxed bg-[#FFFDF8]">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-md px-4 py-3 shadow-xs ${
                msg.role === 'user'
                  ? 'bg-[#111111] text-white font-medium'
                  : 'bg-card border border-border text-foreground prose prose-sm dark:prose-invert'
              }`}
            >
              {msg.role === 'model' ? (
                <div className="whitespace-pre-wrap font-sans break-words space-y-2">
                  {msg.text}
                  {isStreaming && idx === messages.length - 1 && (
                    <span className="inline-block w-2 h-4 ml-1 bg-[#E53935] animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground mt-1 px-1 font-semibold">
              {msg.role === 'user' ? 'You' : 'AI Study Companion'}
            </span>
          </div>
        ))}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">AI Assistant Notice</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-5 py-2.5 border-t border-border bg-[#FFFDF8] flex gap-2 overflow-x-auto no-scrollbar">
        {mode === 'quiz' ? (
          <>
            <button
              onClick={() => handleSendMessage('Can you give me a hint on this question?')}
              disabled={isStreaming}
              className="text-[11px] font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md whitespace-nowrap border border-border shadow-xs transition-colors disabled:opacity-50"
            >
              💡 Hint on question
            </button>
            <button
              onClick={() => handleSendMessage('What core concept is this question testing?')}
              disabled={isStreaming}
              className="text-[11px] font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md whitespace-nowrap border border-border shadow-xs transition-colors disabled:opacity-50"
            >
              📖 Concept tested
            </button>
            <button
              onClick={() => handleSendMessage('How should I break down this problem?')}
              disabled={isStreaming}
              className="text-[11px] font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md whitespace-nowrap border border-border shadow-xs transition-colors disabled:opacity-50"
            >
              🤔 Reasoning guide
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleSendMessage('Can you explain the main concept of this lesson?')}
              disabled={isStreaming}
              className="text-[11px] font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md whitespace-nowrap border border-border shadow-xs transition-colors disabled:opacity-50"
            >
              💡 Explain lesson
            </button>
            <button
              onClick={() => handleSendMessage('Give me a practice challenge based on this lesson.')}
              disabled={isStreaming}
              className="text-[11px] font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md whitespace-nowrap border border-border shadow-xs transition-colors disabled:opacity-50"
            >
              📝 Practice challenge
            </button>
            <button
              onClick={() => handleSendMessage('Can you provide a code example for this topic?')}
              disabled={isStreaming}
              className="text-[11px] font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md whitespace-nowrap border border-border shadow-xs transition-colors disabled:opacity-50"
            >
              💻 Code walkthrough
            </button>
          </>
        )}
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-border bg-card">
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
            className="flex-1 bg-background border border-input rounded-md px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#E53935]/40 disabled:opacity-50 shadow-xs"
          />

          {isStreaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleStopStream}
              className="rounded-md h-10 w-10 text-destructive border-destructive/30 hover:bg-destructive/10"
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-destructive" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!inputMessage.trim()}
              className="rounded-md h-10 w-10 bg-[#111111] hover:bg-black text-white shadow-xs"
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

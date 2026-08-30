"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentUser, clearToken, User } from "@/lib/auth";
import { submitComplaint } from "@/lib/complaints";
import {
  parseChatbotMessage,
  ConversationMessage,
  ExtractedFields,
  ChatbotParseResponse,
} from "@/lib/chatbot";
import {
  CHATBOT_GREETING,
  CHATBOT_ERROR_MESSAGE,
  SUBMISSION_ERROR_MESSAGE,
  SUBMISSION_SUCCESS_MESSAGE,
  CHATBOT_NAME,
} from "@/lib/chatbot-config";

type Phase =
  | "loading"
  | "conversing"
  | "preview"
  | "editing"
  | "submitting"
  | "success"
  | "error";

interface SpeechRecognitionEvent {
  results: {
    [index: number]: { [index: number]: { transcript: string } };
    length: number;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export default function AIChatbotPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [extractedFields, setExtractedFields] = useState<ExtractedFields>({
    title: null,
    description: null,
    category_id: null,
    category_name: null,
    zone_id: null,
    zone_name: null,
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u.role !== "user") {
          router.replace("/login");
          return;
        }
        setUser(u);
        setMessages([{ role: "bot", content: CHATBOT_GREETING }]);
        setPhase("conversing");
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "Unauthorized") {
          clearToken();
        }
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.lang = "ur-PK";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
      };
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: ConversationMessage = {
        role: "user",
        content: text.trim(),
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setIsTyping(true);
      setSuggestions([]);

      try {
        const response: ChatbotParseResponse = await parseChatbotMessage(
          text.trim(),
          updatedMessages,
          extractedFields as unknown as Record<string, unknown>
        );

        const botMsg: ConversationMessage = {
          role: "bot",
          content: response.bot_message,
        };
        setMessages([...updatedMessages, botMsg]);
        setExtractedFields(response.fields);
        setSuggestions(response.suggestions || []);

        if (response.status === "ready") {
          setPhase("preview");
        }
      } catch {
        const errorMsg: ConversationMessage = {
          role: "bot",
          content: CHATBOT_ERROR_MESSAGE,
        };
        setMessages([...updatedMessages, errorMsg]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, extractedFields]
  );

  const handleSubmit = async () => {
    if (!extractedFields.title || !extractedFields.description) return;

    setPhase("submitting");
    setSubmitError(null);

    try {
      const result = await submitComplaint({
        title: extractedFields.title,
        description: extractedFields.description,
        category_id: extractedFields.category_id || null,
        zone_id: extractedFields.zone_id || null,
      });
      setSubmittedId(result.data.id);
      setPhase("success");
    } catch {
      setSubmitError(SUBMISSION_ERROR_MESSAGE);
      setPhase("error");
    }
  };

  const handleRestart = () => {
    setMessages([{ role: "bot", content: CHATBOT_GREETING }]);
    setExtractedFields({
      title: null,
      description: null,
      category_id: null,
      category_name: null,
      zone_id: null,
      zone_name: null,
    });
    setSuggestions([]);
    setPhase("conversing");
    setInput("");
    setSubmitError(null);
    setSubmittedId(null);
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleSuggestion = (text: string) => {
    if (text === "Confirm & Submit") {
      handleSubmit();
    } else if (text === "Edit") {
      setPhase("editing");
    } else if (text === "Cancel") {
      handleRestart();
    } else {
      setInput(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  function renderMessage(msg: ConversationMessage, idx: number) {
    const isBot = msg.role === "bot";
    return (
      <div
        key={idx}
        className={`flex ${isBot ? "justify-start" : "justify-end"} mb-3`}
      >
        <div
          className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
            isBot ? "chat-bubble-bot" : "chat-bubble-user"
          }`}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  function renderPreview() {
    return (
      <div className="chat-preview-card p-5 mb-4">
        <h3 className="text-sm font-semibold text-accent-purple mb-3">
          Issue Preview
        </h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-400">Title:</span>
            <p className="text-white mt-0.5">
              {extractedFields.title || "—"}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Description:</span>
            <p className="text-white mt-0.5">
              {extractedFields.description || "—"}
            </p>
          </div>
          {extractedFields.category_name && (
            <div>
              <span className="text-gray-400">Category:</span>
              <p className="text-white mt-0.5">
                {extractedFields.category_name}
              </p>
            </div>
          )}
          {extractedFields.zone_name && (
            <div>
              <span className="text-gray-400">Location:</span>
              <p className="text-white mt-0.5">
                {extractedFields.zone_name}
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSubmit}
            className="btn-primary text-sm !py-2 !px-4"
          >
            Confirm &amp; Submit
          </button>
          <button
            onClick={() => setPhase("editing")}
            className="btn-secondary text-sm !py-2 !px-4"
          >
            Edit
          </button>
          <button
            onClick={handleRestart}
            className="btn-secondary text-sm !py-2 !px-4"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function renderEditForm() {
    return (
      <div className="chat-preview-card p-5 mb-4">
        <h3 className="text-sm font-semibold text-accent-purple mb-3">
          Edit Issue Details
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1">Title</label>
            <input
              type="text"
              className="glass-input w-full text-sm"
              value={extractedFields.title || ""}
              onChange={(e) =>
                setExtractedFields((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">
              Description
            </label>
            <textarea
              className="glass-input w-full text-sm min-h-[80px]"
              value={extractedFields.description || ""}
              onChange={(e) =>
                setExtractedFields((f) => ({
                  ...f,
                  description: e.target.value,
                }))
              }
            />
          </div>
          {extractedFields.category_name && (
            <div>
              <label className="text-gray-400 text-xs block mb-1">
                Category
              </label>
              <p className="text-white text-sm">
                {extractedFields.category_name}
              </p>
            </div>
          )}
          {extractedFields.zone_name && (
            <div>
              <label className="text-gray-400 text-xs block mb-1">
                Location
              </label>
              <p className="text-white text-sm">{extractedFields.zone_name}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setPhase("preview")}
            className="btn-primary text-sm !py-2 !px-4"
          >
            Back to Preview
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary text-sm !py-2 !px-4"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  function renderSuccess() {
    return (
      <div className="glass-panel p-6 text-center">
        <div className="text-green-400 text-4xl mb-3">&#10003;</div>
        <h3 className="text-lg font-semibold mb-2">Issue Submitted!</h3>
        <p className="text-gray-400 text-sm mb-4">
          {SUBMISSION_SUCCESS_MESSAGE}
        </p>
        <div className="flex gap-3 justify-center">
          {submittedId && (
            <Link
              href={`/dashboard/complaints/${submittedId}`}
              className="btn-primary text-sm"
            >
              View Issue
            </Link>
          )}
          <Link href="/dashboard" className="btn-secondary text-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  function renderError() {
    return (
      <div className="glass-panel p-6 text-center">
        <div className="text-red-400 text-4xl mb-3">&#9888;</div>
        <h3 className="text-lg font-semibold mb-2">Submission Failed</h3>
        <p className="text-gray-400 text-sm mb-4">{submitError}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setPhase("preview");
              setSubmitError(null);
            }}
            className="btn-primary text-sm"
          >
            Retry
          </button>
          <Link
            href="/dashboard/new-complaint"
            className="btn-secondary text-sm"
          >
            Switch to Manual
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-panel-glow px-10 py-8 text-center">
          <div className="w-8 h-8 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      role="user"
      title="AI Reporting Assistant"
      subtitle="Report your issue through natural conversation"
      actions={
        (phase === "conversing" ||
          phase === "preview" ||
          phase === "editing") && (
          <button
            onClick={handleRestart}
            className="btn-secondary text-sm !py-1.5 !px-3"
          >
            Restart
          </button>
        )
      }
    >
      {phase === "success" && renderSuccess()}
      {phase === "error" && renderError()}

      {phase !== "success" && phase !== "error" && (
        <div className="glass-panel flex flex-col" style={{ height: "calc(100vh - 180px)" }}>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-1"
          >
            {messages.map((msg, idx) => renderMessage(msg, idx))}
            {isTyping && (
              <div className="flex justify-start mb-3">
                <div className="chat-bubble-bot px-4 py-3 rounded-2xl text-sm">
                  <span className="inline-flex gap-1">
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    >
                      .
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    >
                      .
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    >
                      .
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {(phase === "preview" || phase === "editing" || phase === "submitting") && (
            <div className="px-4 pb-2">
              {phase === "preview" && renderPreview()}
              {phase === "editing" && renderEditForm()}
              {phase === "submitting" && (
                <div className="chat-preview-card p-4 text-center">
                  <p className="text-gray-400 text-sm">
                    Submitting your issue...
                  </p>
                </div>
              )}
            </div>
          )}

          {suggestions.length > 0 && phase === "conversing" && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() =>
                    s.endsWith("...")
                      ? setInput(s.replace("...", ""))
                      : sendMessage(s)
                  }
                  className="text-xs px-3 py-1.5 rounded-full border border-glass-border bg-glass hover:bg-glass-light text-gray-300 hover:text-white transition-all duration-200"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {(phase === "conversing" || phase === "preview" || phase === "editing") && (
            <div className="chat-input-area p-4 border-t border-glass-border">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="glass-input flex-1 text-sm"
                  placeholder={
                    phase === "conversing"
                      ? "Type your message or use the mic..."
                      : "Type a message to add more details..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isTyping}
                />
                {speechSupported && phase === "conversing" && (
                  <button
                    onClick={toggleVoice}
                    className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                      isListening
                        ? "bg-red-600 text-white animate-pulse"
                        : "bg-glass border border-glass-border text-gray-400 hover:text-white"
                    }`}
                    title={isListening ? "Stop recording" : "Start voice input"}
                  >
                    {isListening ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5"
                      >
                        <path d="M6 6h12v12H6z" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5"
                      >
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                    )}
                  </button>
                )}
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className="btn-primary !py-2.5 !px-4 shrink-0 text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  hidden?: boolean;
}

interface LeadPayload {
  name: string;
  email: string;
  phone: string;
  company: string;
  country: string;
  language: string;
  userType: string;
}

interface LeadInfo extends LeadPayload {
  sessionId: string;
}

interface PersistedChatState {
  isOpen: boolean;
  lead: LeadInfo | null;
  msgs: Message[];
}

const SUGGESTIONS = [
  "How does the QR warranty system work?",
  "What's the pricing for manufacturers?",
  "Tell me about the free pilot program",
  "How does OTP verification work?",
  "What sticker options are available?",
  "How do I get started?",
];

const COUNTRIES = [
  "India",
  "UAE",
  "Saudi Arabia",
  "USA",
  "UK",
  "Singapore",
  "Other",
];

const USER_TYPES = [
  "Manufacturer",
  "Distributor",
  "Service Center",
  "Retailer",
  "Other",
];

const LANGUAGES = [
  "English",
  "Hindi (हिन्दी)",
  "Kannada (ಕನ್ನಡ)",
  "Tamil (தமிழ்)",
  "Telugu (తెలుగు)",
  "Marathi (मराठी)",
  "Bengali (বাংলা)",
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()]{6,20}$/;
const STORAGE_KEY = "warranty-intelligence-chat";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-purple-500"
          style={{
            animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes dotPulse {
          0%,
          80%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </span>
  );
}

function BotAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-800 to-purple-500 text-sm">
      🛡️
    </div>
  );
}

export default function WarrantyChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [leadForm, setLeadForm] = useState<LeadPayload>({
    name: "",
    email: "",
    phone: "",
    company: "",
    country: "India",
    language: "",
    userType: "",
  });
  const [hasLoadedSession, setHasLoadedSession] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const leadNameRef = useRef<HTMLInputElement>(null);
  const visibleMsgs = msgs.filter((msg) => !msg.hidden);
  const userInitial = lead?.name?.trim().charAt(0).toUpperCase() || "U";

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHasLoadedSession(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
      if (typeof parsed.isOpen === "boolean") {
        setIsOpen(parsed.isOpen);
      }
      if (Array.isArray(parsed.msgs)) {
        setMsgs(
          parsed.msgs.filter((msg): msg is Message => {
            return (
              typeof msg === "object" &&
              msg !== null &&
              (msg.role === "user" || msg.role === "assistant") &&
              typeof msg.content === "string" &&
              (msg.hidden === undefined || typeof msg.hidden === "boolean")
            );
          }),
        );
      }
      if (
        parsed.lead &&
        typeof parsed.lead === "object" &&
        typeof parsed.lead.sessionId === "string"
      ) {
        setLead(parsed.lead as LeadInfo);
        setLeadForm({
          name: parsed.lead.name ?? "",
          email: parsed.lead.email ?? "",
          phone: parsed.lead.phone ?? "",
          company: parsed.lead.company ?? "",
          country: parsed.lead.country ?? "India",
          language: parsed.lead.language ?? "",
          userType: parsed.lead.userType ?? "",
        });
      }
    } catch (error) {
      console.error("Failed to restore warranty chat session", error);
    } finally {
      setHasLoadedSession(true);
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  useEffect(() => {
    if (!hasLoadedSession) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          isOpen,
          lead,
          msgs,
        } satisfies PersistedChatState),
      );
    } catch (error) {
      console.error("Failed to persist warranty chat session", error);
    }
  }, [hasLoadedSession, isOpen, lead, msgs]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (lead) {
        inputRef.current?.focus();
        return;
      }

      leadNameRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, lead]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const send = useCallback(
    async (
      text: string,
      options?: { hideUserMessage?: boolean; leadContext?: LeadInfo | null },
    ) => {
      if (!text.trim() || loading) {
        return;
      }

      const userMsg: Message = {
        role: "user",
        content: text.trim(),
        hidden: options?.hideUserMessage || false,
      };
      const history = [...msgs, userMsg];
      setMsgs(history);

      if (!options?.hideUserMessage) {
        setInput("");
      }

      setLoading(true);

      try {
        const activeLead = options?.leadContext ?? lead;
        const apiMessages = history.map(({ role, content }) => {
          if (role !== "user" || !activeLead?.language) {
            return { role, content };
          }

          return {
            role,
            content: `${content}\n\nPlease respond in ${activeLead.language} for this and future replies in this chat.`,
          };
        });

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            lead: activeLead
              ? {
                  sessionId: activeLead.sessionId,
                  name: activeLead.name,
                  email: activeLead.email,
                  phone: activeLead.phone,
                  company: activeLead.company,
                  country: activeLead.country,
                  language: activeLead.language,
                  userType: activeLead.userType,
                }
              : null,
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          reply?: string;
        };

        if (data.error) {
          setMsgs((prev) => [
            ...prev,
            { role: "assistant", content: data.error as string },
          ]);
        } else {
          setMsgs((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                data.reply ||
                "I'm sorry, I couldn't process that. Please try again.",
            },
          ]);
        }
      } catch {
        setMsgs((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "I'm having trouble connecting. Please reach us on WhatsApp at +91 78999 10288.",
          },
        ]);
      }

      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [lead, loading, msgs],
  );

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  const validateLeadPayload = (payload: LeadPayload): string | null => {
    if (
      !payload.name ||
      !payload.email ||
      !payload.phone ||
      !payload.company ||
      !payload.country ||
      !payload.language ||
      !payload.userType
    ) {
      return "Please complete all fields to start chat.";
    }

    if (!LANGUAGES.includes(payload.language)) {
      return "Please select a valid preferred language.";
    }

    if (!USER_TYPES.includes(payload.userType)) {
      return "Please select a valid user type.";
    }

    if (!COUNTRIES.includes(payload.country)) {
      return "Please select a valid country.";
    }

    if (!EMAIL_REGEX.test(payload.email)) {
      return "Please enter a valid email address.";
    }

    if (!PHONE_REGEX.test(payload.phone)) {
      return "Please enter a valid phone number.";
    }

    return null;
  };

  const handleLeadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (leadSubmitting || loading || lead) {
      return;
    }

    const payload: LeadPayload = {
      name: leadForm.name.trim(),
      email: leadForm.email.trim().toLowerCase(),
      phone: leadForm.phone.trim(),
      company: leadForm.company.trim(),
      country: leadForm.country.trim(),
      language: leadForm.language.trim(),
      userType: leadForm.userType.trim(),
    };

    const validationError = validateLeadPayload(payload);
    if (validationError) {
      setLeadError(validationError);
      return;
    }

    setLeadError("");
    setLeadSubmitting(true);

    try {
      const response = await fetch("/api/chat/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
        sessionId?: string;
      };

      if (!response.ok || !data.success || !data.sessionId) {
        setLeadError(data.error || "Unable to start chat right now.");
        return;
      }

      const leadInfo: LeadInfo = {
        ...payload,
        sessionId: data.sessionId,
      };
      setLead(leadInfo);

      const introMessage = `I am ${leadInfo.name} from ${leadInfo.company}, a ${leadInfo.userType} from ${leadInfo.country}. Please respond in ${leadInfo.language}. Greet me briefly and ask how you can help with warranty management.`;
      await send(introMessage, {
        hideUserMessage: true,
        leadContext: leadInfo,
      });
    } catch {
      setLeadError("Unable to start chat right now. Please try again.");
    } finally {
      setLeadSubmitting(false);
    }
  };

  const onLeadFieldChange = (field: keyof LeadPayload, value: string) => {
    setLeadForm((prev) => ({ ...prev, [field]: value }));
    if (leadError) {
      setLeadError("");
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-2xl transition-transform hover:scale-110 active:scale-95"
        style={{ background: "linear-gradient(135deg, #7c3aed, #6366f1)" }}
        aria-label="Open chat"
      >
        🛡️
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        width: "min(420px, calc(100vw - 32px))",
        height: "min(640px, calc(100vh - 48px))",
        background: "#1a1a2e",
        color: "#e2e8f0",
        border: "1px solid #2d2d44",
      }}
    >
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3"
        style={{
          borderBottom: "1px solid #2d2d44",
          background: "linear-gradient(135deg, #1a1a2e, #16213e)",
        }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
          style={{ background: "linear-gradient(135deg, #7c3aed, #6366f1)" }}
        >
          🛡️
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-gray-100">
            Warranty Intelligence
          </div>
          <div className="text-xs text-gray-400">
            {lead
              ? "AI Assistant • Ask me anything"
              : "Complete details to start chat"}
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      {!lead ? (
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mb-5">
            <p className="mb-1 text-sm font-semibold text-gray-200">
              Welcome to Warranty Intelligence
            </p>
            <p className="text-xs leading-relaxed text-gray-400">
              Please share your details to start chatting with our assistant.
            </p>
          </div>

          <form onSubmit={handleLeadSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="lead-name"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                Name
              </label>
              <input
                id="lead-name"
                ref={leadNameRef}
                type="text"
                value={leadForm.name}
                onChange={(event) =>
                  onLeadFieldChange("name", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label
                htmlFor="lead-email"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                Email
              </label>
              <input
                id="lead-email"
                type="email"
                value={leadForm.email}
                onChange={(event) =>
                  onLeadFieldChange("email", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label
                htmlFor="lead-phone"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                Phone
              </label>
              <input
                id="lead-phone"
                type="tel"
                value={leadForm.phone}
                onChange={(event) =>
                  onLeadFieldChange("phone", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                placeholder="+91 98765 43210"
                autoComplete="tel"
                required
              />
            </div>

            <div>
              <label
                htmlFor="lead-company"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                Company
              </label>
              <input
                id="lead-company"
                type="text"
                value={leadForm.company}
                onChange={(event) =>
                  onLeadFieldChange("company", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                placeholder="Your company name"
                autoComplete="organization"
                required
              />
            </div>

            <div>
              <label
                htmlFor="lead-country"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                Country
              </label>
              <select
                id="lead-country"
                value={leadForm.country}
                onChange={(event) =>
                  onLeadFieldChange("country", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                required
              >
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="lead-language"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                Preferred Language
              </label>
              <select
                id="lead-language"
                value={leadForm.language}
                onChange={(event) =>
                  onLeadFieldChange("language", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                required
              >
                <option value="" disabled>
                  Select preferred language
                </option>
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="lead-user-type"
                className="mb-1.5 block text-xs font-semibold text-gray-300"
              >
                User Type
              </label>
              <select
                id="lead-user-type"
                value={leadForm.userType}
                onChange={(event) =>
                  onLeadFieldChange("userType", event.target.value)
                }
                className="w-full rounded-lg border border-[#3d3d55] bg-[#2d2d44] px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                required
              >
                <option value="" disabled>
                  Select user type
                </option>
                {USER_TYPES.map((userType) => (
                  <option key={userType} value={userType}>
                    {userType}
                  </option>
                ))}
              </select>
            </div>

            {leadError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
                {leadError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={leadSubmitting}
              className="w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6366f1)" }}
            >
              {leadSubmitting ? "Starting Chat..." : "Start Chat"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="sr-only" aria-live="polite">
              {loading
                ? "Warranty Intelligence is typing"
                : `${visibleMsgs.length} messages in chat`}
            </div>
            {visibleMsgs.length === 0 && msgs.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mb-3 text-4xl">🛡️</div>
                <p className="mb-1 text-sm font-semibold text-gray-200">
                  Warranty Intelligence Assistant
                </p>
                <p className="mb-5 text-xs leading-relaxed text-gray-400">
                  Ask about QR warranty activation, OTP verification,
                  <br />
                  pilot pricing, or sticker options.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void send(suggestion)}
                      className="rounded-full px-3 py-2 text-xs transition-colors"
                      style={{
                        border: "1px solid #334155",
                        background: "transparent",
                        color: "#94a3b8",
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.borderColor =
                          "#7c3aed";
                        event.currentTarget.style.color = "#a78bfa";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor =
                          "#334155";
                        event.currentTarget.style.color = "#94a3b8";
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {visibleMsgs.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`mb-5 flex gap-3 ${
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {message.role === "user" ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600 text-xs font-bold text-white">
                    {userInitial}
                  </div>
                ) : (
                  <BotAvatar />
                )}
                <div
                  className="max-w-[80%] whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed"
                  style={{
                    borderRadius:
                      message.role === "user"
                        ? "16px 4px 16px 16px"
                        : "4px 16px 16px 16px",
                    background:
                      message.role === "user"
                        ? "#2d2d44"
                        : "rgba(124, 58, 237, 0.08)",
                    color: "#e2e8f0",
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="mb-5 flex gap-3">
                <BotAvatar />
                <div className="px-4 py-3">
                  <TypingDots />
                </div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          <div
            className="shrink-0 px-4 py-3"
            style={{ borderTop: "1px solid #2d2d44" }}
          >
            <div
              className="flex items-end gap-2 rounded-full px-4 py-2"
              style={{
                background: "#2d2d44",
                border: "1px solid #3d3d55",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about warranty solutions..."
                rows={1}
                className="flex-1 resize-none border-none bg-transparent py-1 text-sm text-gray-200 outline-none"
                style={{
                  fontFamily: "inherit",
                  lineHeight: "1.5",
                  maxHeight: 100,
                  overflowY: "auto",
                }}
                onInput={(event) => {
                  const target = event.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
                }}
              />
              <button
                onClick={() => void send(input)}
                disabled={!input.trim() || loading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white transition-colors"
                style={{
                  background: input.trim() && !loading ? "#7c3aed" : "#4a4a5a",
                  cursor: input.trim() && !loading ? "pointer" : "default",
                }}
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
            <div className="mt-2 text-center">
              <span className="text-[10px] text-gray-500">
                FeedbackNFC • Bengaluru, India
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

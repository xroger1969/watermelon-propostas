"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { trackLeadConversion } from "@/lib/marketing";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Recommendation = {
  code: string;
  title: string;
  reason: string;
  category: string;
  location: string;
  duration: string;
  image: string;
  url: string;
  optionCode: string;
  optionName: string;
  price: number | null;
  currency: string;
  livePrice: boolean;
};

type TailorMadeIdea = {
  title: string;
  concept: string;
  reason: string;
  status: "tailor_made_concept";
};

type ConciergeResponse = {
  reply?: string;
  question?: string;
  intentSummary?: string;
  recommendations?: Recommendation[];
  tailorMadeIdeas?: TailorMadeIdea[];
  crmReference?: string;
  crmCreated?: boolean;
  error?: string;
  code?: string;
};

type ProposalItem = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  price: string;
  notes: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;

  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

const STORAGE_KEY = "watermelon-proposal";

const QUICK_PROMPTS = [
  "Plan one perfect day near Lisbon",
  "We love wine, culture and local food",
  "Beach, nature and horseback riding",
  "Family-friendly ideas for our group",
];

function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function readProposal(): ProposalItem[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function comparableText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?…]+$/g, "")
    .toLocaleLowerCase();
}

function buildAssistantText(reply?: string, question?: string) {
  const replyText = (reply || "").trim();
  const questionText = (question || "").trim();

  if (!replyText) return questionText;
  if (!questionText) return replyText;

  const comparableReply = comparableText(replyText);
  const comparableQuestion = comparableText(questionText);

  if (
    comparableReply === comparableQuestion ||
    comparableReply.endsWith(comparableQuestion)
  ) {
    return replyText;
  }

  return replyText + "\n\n" + questionText;
}

export default function AIConcierge({
  variant = "home",
}: {
  variant?: "home" | "proposal";
}) {
  const proposalMode = variant === "proposal";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [tailorMadeIdeas, setTailorMadeIdeas] = useState<TailorMadeIdea[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [crmReference, setCrmReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addedCodes, setAddedCodes] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const chatWindowRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechDraftRef = useRef("");
  const sendVoiceOnEndRef = useRef(false);

  useEffect(() => {
    const chatWindow = chatWindowRef.current;
    if (!chatWindow) return;

    const frame = window.requestAnimationFrame(() => {
      chatWindow.scrollTo({
        top: chatWindow.scrollHeight,
        behavior: messages.length > 1 ? "smooth" : "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, loading, error, crmReference]);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));

    return () => {
      sendVoiceOnEndRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const whatsappText = useMemo(() => {
    if (!recommendations.length) {
      return "Hello Watermelon Experiences, I am planning a trip in Portugal and would like some help.";
    }

    const titles = recommendations.map((item) => "- " + item.title).join("\n");
    return (
      "Hello Watermelon Experiences, I used your AI Concierge and I am interested in this plan:\n\n" +
      titles +
      "\n\nCould you help me refine it and confirm availability?"
    );
  }, [recommendations]);

  async function askConcierge(messageOverride?: string) {
    const message = (messageOverride ?? input).trim();
    if (!message || loading) return;

    const history = messages.slice(-8);
    const activeConversationId =
      conversationId ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : "wm-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    if (!conversationId) setConversationId(activeConversationId);

    setMessages((current) => [...current, { role: "user", content: message }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai-concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          conversationId: activeConversationId,
          crmReference,
          currentRecommendations: recommendations.map((item) => ({
            code: item.code,
            title: item.title,
            reason: item.reason,
          })),
          currentTailorMadeIdeas: tailorMadeIdeas.map((item) => ({
            title: item.title,
            concept: item.concept,
            reason: item.reason,
          })),
        }),
      });

      const data = (await response.json()) as ConciergeResponse;

      if (!response.ok) {
        throw new Error(
          data.code === "OPENAI_NOT_CONFIGURED"
            ? "The AI Concierge is almost ready. Watermelon is finishing its secure AI connection."
            : data.error || "I could not complete that request."
        );
      }

      const assistantText = buildAssistantText(data.reply, data.question);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: assistantText || "Tell me a little more about the trip you have in mind.",
        },
      ]);
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
      setTailorMadeIdeas(Array.isArray(data.tailorMadeIdeas) ? data.tailorMadeIdeas : []);
      if (data.crmReference) setCrmReference(data.crmReference);
      if (data.crmCreated) void trackLeadConversion("ai_crm_lead");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The AI Concierge is temporarily unavailable."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleVoiceInput() {
    if (loading) return;

    if (isListening) {
      sendVoiceOnEndRef.current = true;
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setSpeechError("Voice input is not supported by this browser. You can still type your message.");
      return;
    }

    const recognition = new SpeechRecognition();
    const initialInput = input.trim();
    speechDraftRef.current = initialInput;
    sendVoiceOnEndRef.current = false;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript || "";
      }

      const spokenText = transcript.trim();
      const combined = initialInput
        ? initialInput + (spokenText ? " " + spokenText : "")
        : spokenText;

      const nextInput = combined.slice(0, 1200);
      speechDraftRef.current = nextInput;
      setInput(nextInput);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;

      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow microphone access in your browser settings and try again."
          : event.error === "no-speech"
            ? "I did not hear anything. Tap the microphone and try again."
            : "Voice input could not start. Please try again or type your message.";

      sendVoiceOnEndRef.current = false;
      setSpeechError(message);
      setIsListening(false);
    };

    recognition.onend = () => {
      const shouldSend = sendVoiceOnEndRef.current;
      const voiceMessage = speechDraftRef.current.trim();

      sendVoiceOnEndRef.current = false;
      setIsListening(false);
      recognitionRef.current = null;

      if (shouldSend && voiceMessage) {
        window.setTimeout(() => {
          void askConcierge(voiceMessage);
        }, 0);
      }
    };

    try {
      setSpeechError("");
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setSpeechError("Voice input could not start. Please try again or type your message.");
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void askConcierge();
  }

  function addRecommendations(items: Recommendation[]) {
    const proposal = readProposal();
    const existingCodes = new Set(proposal.map((item) => item.code));
    const newlyAdded: string[] = [];

    for (const item of items) {
      if (existingCodes.has(item.code)) continue;

      proposal.push({
        code: item.code,
        title: item.title,
        optionCode: item.optionCode || "DEFAULT",
        optionName: item.optionName || "Standard option",
        price: item.price === null ? "" : String(item.price),
        notes: "Suggested by Watermelon AI Concierge: " + item.reason,
      });
      existingCodes.add(item.code);
      newlyAdded.push(item.code);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(proposal));
    setAddedCodes((current) => Array.from(new Set([...current, ...newlyAdded])));
    window.dispatchEvent(new Event("watermelon-proposal-updated"));
  }

  function buildProposal() {
    addRecommendations(recommendations);

    if (proposalMode) {
      window.setTimeout(() => {
        document.getElementById("proposal-builder")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
      return;
    }

    window.location.href = "/proposta";
  }

  return (
    <section
      className={"ai-concierge-section" + (proposalMode ? " ai-concierge-compact" : "")}
      id={proposalMode ? "proposal-ai-concierge" : "ai-concierge"}
      aria-labelledby={proposalMode ? "proposal-ai-concierge-title" : "ai-concierge-title"}
    >
      <div className="ai-concierge-shell">
        <div className="ai-concierge-intro">
          <div className="ai-concierge-kicker">
            <span className="ai-spark">✦</span>
            WATERMELON AI CONCIERGE
          </div>
          <h2 id={proposalMode ? "proposal-ai-concierge-title" : "ai-concierge-title"}>
            {proposalMode
              ? "Plan your experience with AI."
              : "Let’s plan your trip with Watermelon Experiences AI."}
          </h2>
          <p>
            {proposalMode
              ? "Tell us your dates, group and interests. Get ideas for your personalised proposal."
              : "Tell us your dates, group and interests. Our AI will help you explore Watermelon experiences."}
          </p>

        </div>

        <div className={"ai-concierge-panel" + (messages.length === 0 ? " ai-concierge-empty" : "")}>
          <div className="ai-chat-window" aria-live="polite" ref={chatWindowRef}>
            {messages.length === 0 ? (
              <div className="ai-welcome">
                <span className="ai-avatar" aria-hidden="true">W</span>
                <div>
                  <strong>Chat with your AI travel planner</strong>
                  <p>
                    Start below — tell us what you would love to do.
                  </p>
                </div>
              </div>
            ) : (
              <div className="ai-message-list">
                {messages.map((message, index) => (
                  <div
                    className={
                      message.role === "user"
                        ? "ai-message ai-message-user"
                        : "ai-message ai-message-assistant"
                    }
                    key={message.role + "-" + index}
                  >
                    {message.role === "assistant" && (
                      <span className="ai-avatar ai-avatar-small" aria-hidden="true">W</span>
                    )}
                    <p>{message.content}</p>
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="ai-thinking">
                <span />
                <span />
                <span />
                <b>Building your Watermelon plan…</b>
              </div>
            )}
          </div>



          <form className="ai-input-row" onSubmit={onSubmit}>
            <label className="ai-input-label" htmlFor={proposalMode ? "proposal-ai-message" : "home-ai-message"}>Your trip starts here ↓</label>
            <div className="ai-input-field">
              <textarea
                id={proposalMode ? "proposal-ai-message" : "home-ai-message"}
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type or speak… e.g. 2 adults in Lisbon, one day, food and sea views"
                maxLength={1200}
                disabled={loading}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (input.trim() && !isListening) void askConcierge();
                  }
                }}
              />

              {speechSupported && (
                <button
                  className={"ai-voice-button" + (isListening ? " ai-voice-button-active" : "")}
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={loading}
                  aria-label={isListening ? "Stop voice input" : "Write with microphone"}
                  aria-pressed={isListening}
                  title={isListening ? "Stop listening" : "Write with microphone"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 15.25a3.75 3.75 0 0 0 3.75-3.75V6.75a3.75 3.75 0 1 0-7.5 0v4.75A3.75 3.75 0 0 0 12 15.25Z" />
                    <path d="M5.75 11.25a6.25 6.25 0 0 0 12.5 0M12 17.5V21M8.75 21h6.5" />
                  </svg>
                </button>
              )}

              {isListening && (
                <span className="ai-voice-status" role="status">
                  <span aria-hidden="true" />
                  Listening… tap the microphone to stop
                </span>
              )}

              {speechError && (
                <span className="ai-voice-error" role="status">
                  {speechError}
                </span>
              )}
            </div>

            <button type="submit" disabled={loading || isListening || !input.trim()}>
              {loading ? "Planning…" : isListening ? "Listening…" : "Plan with AI"}
            </button>
          </form>

          {messages.length === 0 && (
            <div className="ai-quick-prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button type="button" key={prompt} onClick={() => void askConcierge(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {crmReference && (
            <div className="ai-crm-confirmation" role="status">
              <strong>✓ Request received by Watermelon</strong>
              <span>CRM reference: {crmReference}</span>
            </div>
          )}

          {error && <div className="ai-error">{error}</div>}
        </div>
      </div>


      {tailorMadeIdeas.length > 0 && (
        <div className="ai-tailor-made">
          <div className="ai-recommendations-head">
            <div>
              <p className="eyebrow dark">TAILOR-MADE IDEAS</p>
              <h3>Ideas Watermelon could design specially for you</h3>
            </div>
          </div>

          <div className="ai-tailor-grid">
            {tailorMadeIdeas.map((idea, index) => {
              const message =
                "Hello Watermelon Experiences, your AI Concierge suggested this tailor-made concept:\n\n" +
                idea.title +
                "\n\n" +
                idea.concept +
                "\n\nWhy it fits: " +
                idea.reason +
                "\n\nI understand this is not yet an available product and is subject to Watermelon review, feasibility, availability and quotation. Could you review it for me?";

              return (
                <article className="ai-tailor-card" key={idea.title + "-" + index}>
                  <div className="ai-tailor-badge">TAILOR-MADE CONCEPT</div>
                  <h4>{idea.title}</h4>
                  <p>{idea.concept}</p>
                  <div className="ai-tailor-reason">
                    <strong>Why it may suit you</strong>
                    <span>{idea.reason}</span>
                  </div>
                  <div className="ai-tailor-warning">
                    Not currently available as a Watermelon product. Subject to our review,
                    feasibility, availability and quotation.
                  </div>
                  <a
                    className="ai-tailor-action"
                    href={"https://wa.me/351918404101?text=" + encodeURIComponent(message)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ask Watermelon to create this
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="ai-recommendations">
          <div className="ai-recommendations-head">
            <div>
              <p className="eyebrow dark">YOUR AI SHORTLIST</p>
              <h3>{proposalMode ? "Add these suggestions to your proposal" : "A plan built from Watermelon experiences"}</h3>
            </div>
            <button className="ai-build-proposal" type="button" onClick={buildProposal}>
              {proposalMode ? "Add all to proposal" : "Build this proposal"}
            </button>
          </div>

          <div className="ai-recommendation-grid">
            {recommendations.map((item) => {
              const added = addedCodes.includes(item.code);
              return (
                <article className="ai-recommendation-card" key={item.code}>
                  <img src={item.image || "/logo-full.jpg"} alt="" loading="lazy" />
                  <div className="ai-recommendation-body">
                    <div className="ai-recommendation-meta">
                      <span>{item.location}</span>
                      <span>{item.duration}</span>
                    </div>
                    <h4>{item.title}</h4>
                    <p>{item.reason}</p>
                    <div className="ai-recommendation-bottom">
                      <div>
                        <small>{item.price === null ? "Price" : "From"}</small>
                        <strong>
                          {item.price === null ? "On request" : money(item.price, item.currency)}
                        </strong>
                        {item.price !== null && (
                          <em>{item.livePrice ? "live price check" : "guide price"}</em>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => addRecommendations([item])}
                        disabled={added}
                      >
                        {added ? "Added ✓" : "Add to proposal"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="ai-human-handoff">
            <div>
              <strong>Want a human to take it from here?</strong>
              <span>Send this shortlist to Watermelon on WhatsApp and we can refine it with you.</span>
            </div>
            <a
              href={"https://wa.me/351918404101?text=" + encodeURIComponent(whatsappText)}
              target="_blank"
              rel="noreferrer"
            >
              Continue on WhatsApp
            </a>
          </div>
        </div>
      )}

      <p className="ai-disclaimer">
        Explore our experiences or tailor-made ideas for our team to review. Final itinerary, availability and price are
        confirmed by Watermelon Experiences before booking.
      </p>
    </section>
  );
}

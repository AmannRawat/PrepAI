import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent, ALLOWED_EVENTS } from "../utils/analytics.js";
import {
    Check,
    Copy,
    Lightbulb,
    Minus,
    Send,
    Sparkles,
    Volume2,
    VolumeX,
    CalendarDays,
    Target,
    TrendingUp,
    RotateCcw,
    Trash2,
    AlertTriangle,
    AlertCircle,
    Bug,
    Lock,
    LogIn,
    ExternalLink,
} from "lucide-react";
import PepeAvatar from "./PepeAvatar";

const createId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function PrepAIRobot({ speaking = false, thinking = false, expression = "happy" }) {
    return (
        <PepeAvatar
            isSpeaking={speaking}
            isThinking={thinking || expression === "thinking"}
            isCelebrating={expression === "celebrating"}
            size="custom"
            className="w-full h-full"
        />
    );
}

function playCoachSound(type, audioContextRef, volume = 0.08) {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
        let ctx = audioContextRef.current;

        if (!ctx) {
            ctx = new AudioContextClass();
            audioContextRef.current = ctx;
        }

        if (ctx.state === "suspended") {
            ctx.resume().catch(() => { });
        }

        const now = ctx.currentTime;

        const tone = (frequency, start, duration, wave = "sine", gain = volume) => {
            const oscillator = ctx.createOscillator();
            const envelope = ctx.createGain();

            oscillator.type = wave;
            oscillator.frequency.setValueAtTime(frequency, start);
            envelope.gain.setValueAtTime(0.0001, start);
            envelope.gain.exponentialRampToValueAtTime(gain, start + 0.005);
            envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

            oscillator.connect(envelope);
            envelope.connect(ctx.destination);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.01);
        };

        if (type === "typing") {
            const frequency = 1200 + Math.random() * 600;
            tone(frequency, now, 0.025, "triangle", 0.035);
        } else if (type === "thinking") {
            tone(480, now, 0.1, "sine", 0.035);
            tone(620, now + 0.1, 0.12, "sine", 0.035);
        } else if (type === "send") {
            tone(700, now, 0.06, "sine", 0.03);
            tone(900, now + 0.05, 0.06, "sine", 0.03);
        }
    } catch {
        // Audio must never break the coach.
    }
}

/**
 * Makes common AI-generated LaTeX notation more readable.
 * This is intentionally lightweight, not a complete LaTeX renderer.
 */
function cleanMath(text) {
    return text
        // Convert display-style LaTeX into readable plain text.
        .replace(/\$\$([\s\S]*?)\$\$/g, (_, expression) =>
            expression
                .replace(/\\text\{([^}]*)\}/g, "$1")
                .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1) / ($2)")
                .replace(/\\times/g, "×")
                .replace(/\\cdot/g, "·")
                .replace(/\\leq/g, "≤")
                .replace(/\\geq/g, "≥")
                .replace(/\\neq/g, "≠")
                .replace(/\\,/g, " ")
                .replace(/\\left|\\right/g, "")
                .replace(/[{}]/g, "")
                .replace(/\\/g, "")
                .trim()
        )
        // Convert inline LaTeX to readable text.
        .replace(/\$([^$\n]+)\$/g, "$1")
        // Fix Markdown that the model returns with escaped symbols.
        .replace(/\\(#{1,3})\s+/g, "$1 ")
        .replace(/\\([-*_]{3,})/g, "$1")
        .replace(/\\([|])/g, "$1")
        .replace(/\\([*])/g, "$1")
        .replace(/\\([\[\]()])/g, "$1")
        .trim();
}

function MessageContent({ text, typing = false }) {
    const [copiedBlock, setCopiedBlock] = useState(null);

    const copyCode = async (code, id) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedBlock(id);
            window.setTimeout(() => setCopiedBlock(null), 1600);
        } catch (error) {
            console.error("Unable to copy code:", error);
        }
    };

    const renderInline = (line, keyPrefix, showCursor = false) => {
        const tokens = line.split(/(\*\*\[[^\]]+\]\([^)]+\)\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

        const result = tokens.map((token, index) => {
            const key = `${keyPrefix}-${index}`;

            const linkMatch = token.match(/^(\*\*)?\[([^\]]+)\]\(([^)]+)\)(\*\*)?$/);
            if (linkMatch) {
                const isBold = Boolean(linkMatch[1] && linkMatch[4]);
                const rawText = linkMatch[2];
                const href = linkMatch[3];
                const linkText = rawText.replace(/^\*\*|\*\*$/g, "");
                return (
                    <a
                        key={key}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 text-accent hover:underline focus:outline-none focus:ring-1 focus:ring-accent rounded ${
                            isBold ? "font-semibold" : "font-medium"
                        }`}
                    >
                        <span>{linkText}</span>
                        <ExternalLink size={12} className="inline shrink-0 opacity-70" />
                    </a>
                );
            }

            if (token.startsWith("`") && token.endsWith("`")) {
                return (
                    <code
                        key={key}
                        className="rounded bg-text-secondary/10 px-1 py-0.5 font-mono text-[0.9em]"
                    >
                        {token.slice(1, -1)}
                    </code>
                );
            }

            if (token.startsWith("**") && token.endsWith("**")) {
                return (
                    <strong key={key} className="font-semibold">
                        {token.slice(2, -2)}
                    </strong>
                );
            }

            if (token.startsWith("*") && token.endsWith("*")) {
                return <em key={key}>{token.slice(1, -1)}</em>;
            }

            return token;
        });

        if (showCursor) {
            result.push(
                <span
                    key={`${keyPrefix}-cursor`}
                    aria-hidden="true"
                    className="ml-1 inline-block h-3 w-1 animate-pulse rounded-sm bg-current align-middle"
                />
            );
        }

        return result;
    };

    const blocks = text.split(/```([\w+#.-]*)\n([\s\S]*?)```/g);
    const rendered = [];

    for (let i = 0; i < blocks.length; i += 1) {
        if (i % 3 === 1) {
            const language = blocks[i] || "code";
            const code = blocks[i + 1] || "";
            const id = `${i}-${code.length}`;

            rendered.push(
                <div
                    key={`code-${id}`}
                    className="my-2 min-w-0 overflow-hidden rounded-lg border border-text-secondary/20"
                >
                    <div className="flex items-center justify-between border-b border-text-secondary/15 bg-text-secondary/[0.06] px-2.5 py-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                            {language}
                        </span>
                        <button
                            type="button"
                            onClick={() => copyCode(code.replace(/\n$/, ""), id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-text-secondary/10"
                        >
                            {copiedBlock === id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedBlock === id ? "Copied" : "Copy"}
                        </button>
                    </div>

                    <pre className="max-w-full overflow-x-auto bg-black/5 p-3 text-xs leading-5 dark:bg-black/20">
                        <code className="font-mono">{code.replace(/\n$/, "")}</code>
                    </pre>
                </div>
            );

            i += 2;
            continue;
        }

        const plainText = cleanMath(blocks[i] || "");
        if (!plainText.trim()) continue;

        const lines = plainText.split("\n");
        let listType = null;
        let listItems = [];
        const nodes = [];

        const flushList = (key) => {
            if (!listItems.length) return;

            const ListTag = listType === "number" ? "ol" : "ul";

            nodes.push(
                <ListTag
                    key={key}
                    className={`my-2 space-y-1 pl-5 ${listType === "number" ? "list-decimal" : "list-disc"
                        }`}
                >
                    {listItems}
                </ListTag>
            );

            listItems = [];
            listType = null;
        };

        lines.forEach((rawLine, lineIndex) => {
            const line = rawLine.trim();

            const bullet = line.match(/^[-*•]\s+(.+)/);
            const numbered = line.match(/^\d+[.)]\s+(.+)/);
            const currentType = bullet ? "bullet" : numbered ? "number" : null;

            if (currentType) {
                if (listType && listType !== currentType) {
                    flushList(`list-${i}-${lineIndex}`);
                }

                listType = currentType;
                listItems.push(
                    <li key={`li-${i}-${lineIndex}`}>
                        {renderInline((bullet || numbered)[1], `inline-${i}-${lineIndex}`)}
                    </li>
                );
                return;
            }

            flushList(`list-${i}-${lineIndex}`);

            if (!line || /^[-*_]{3,}$/.test(line)) return;

            const heading = line.match(/^(#{1,3})\s+(.+)/);

            if (heading) {
                const level = heading[1].length;
                const headingClass =
                    level === 1
                        ? "text-base font-bold"
                        : level === 2
                            ? "text-sm font-bold"
                            : "text-sm font-semibold";

                nodes.push(
                    <div
                        key={`heading-${i}-${lineIndex}`}
                        className={`${headingClass} mb-1 mt-3 first:mt-0`}
                    >
                        {renderInline(heading[2], `heading-${i}-${lineIndex}`)}
                    </div>
                );
                return;
            }

            nodes.push(
                <p key={`p-${i}-${lineIndex}`} className="my-1.5">
                    {renderInline(
                        line.replace(/^\*\*(.+)\*\*$/, "$1"),
                        `inline-${i}-${lineIndex}`,
                        typing && lineIndex === lines.length - 1
                    )}
                </p>
            );
        });

        flushList(`list-${i}-end`);

        rendered.push(
            <div key={`text-${i}`} className="min-w-0 break-words">
                {nodes}
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-1 break-words text-sm leading-6">
            {rendered}
        </div>
    );
}

function PlanCard({
    plan = null,
    onboardingProfile = null,
    onPersonalize = () => { },
    onRestartOnboarding = null,
    isTyping = false,
    isRequesting = false,
}) {
    const defaultDays = [
        { day: "Monday", topic: "Arrays & Two Pointers", task: "Solve 2 problems" },
        { day: "Tuesday", topic: "Strings & Hash Maps", task: "Solve 2 problems" },
        { day: "Wednesday", topic: "Binary Search", task: "Solve 2 problems" },
        { day: "Thursday", topic: "Linked Lists & Fast/Slow", task: "Solve 2 problems" },
        { day: "Friday", topic: "Trees & Recursion", task: "Solve 2 problems" },
        { day: "Saturday", topic: "Dynamic Programming / Graphs", task: "Solve 2 problems" },
        { day: "Sunday", topic: "Weekly Review & Mistakes", task: "Revisit mistakes & analyze patterns" },
    ];

    const days = Array.isArray(plan?.schedule) && plan.schedule.length > 0
        ? plan.schedule
        : defaultDays;
    const isPersonalized = Boolean(plan?.schedule);

    return (
        <div className="space-y-3">
            <div>
                <div className="flex items-center gap-2 font-semibold">
                    <CalendarDays size={16} className="text-emerald-500" />
                    <span>{plan?.title || "Your DSA Preparation Plan"}</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                    {isPersonalized
                        ? `Tailored plan: ${plan?.focusAreas || onboardingProfile?.targetCompanies || "Interview readiness"} (${plan?.dailyTarget || onboardingProfile?.dailyTime || "45-60 min/day"}).`
                        : "Starter study template. Personalize it with your target companies, daily study time, and weak topics!"}
                </p>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {days.map((item) => (
                    <div
                        key={item.day}
                        className="flex items-center gap-2.5 rounded-lg border border-text-secondary/15 bg-surface/50 p-2"
                    >
                        <div className="w-[74px] shrink-0 text-xs font-semibold text-accent">{item.day}</div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-text-primary truncate">{item.topic}</p>
                            <p className="text-[11px] text-text-secondary truncate">{item.task}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-lg bg-emerald-500/10 p-2.5 text-xs leading-5">
                <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Target size={14} />
                    Daily routine
                </div>
                {plan?.dailyRoutine || "Aim for 45–60 minutes: revise key concepts, solve problems independently, and record mistakes to review later."}
            </div>

            {plan?.focusAreas && (
                <div className="flex items-start gap-1.5 text-xs text-text-secondary">
                    <TrendingUp size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span>Focus areas: {plan.focusAreas}</span>
                </div>
            )}

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onPersonalize}
                    disabled={isTyping || isRequesting}
                    className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                    {isPersonalized ? "Revise / Update Plan" : "Personalize My Plan"}
                </button>
                {onRestartOnboarding && (
                    <button
                        type="button"
                        onClick={onRestartOnboarding}
                        disabled={isTyping || isRequesting}
                        className="rounded-lg border border-text-secondary/25 px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-text-secondary/10 hover:text-text-primary disabled:opacity-50"
                        title="Restart onboarding questionnaire"
                    >
                        Restart Onboarding
                    </button>
                )}
            </div>
        </div>
    );
}

export default function DsaCoach({
    activeProblem = null,
    code = "",
    language = "javascript",
    runResults = null,
    executionResults = null,
    evaluationError = null,
    onResetSession = null,
    onClearAllCoachData = null,
    onLoadProblem = null,
    resetTrigger = 0,
    hasGivenUp: propHasGivenUp = false,
    onGiveUp = null,
    onHintLevelChange = null,
}) {
    const { getToken, isLoggedIn, userId } = useAuth();
    const { openLogin } = useModal();

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [typingMessageId, setTypingMessageId] = useState(null);
    const [expression, setExpression] = useState("happy");
    const [input, setInput] = useState("");
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [position, setPosition] = useState({ x: 0, y: 64 });
    const [panelSize, setPanelSize] = useState({ width: 360, height: 350 });
    const userPositionRef = useRef({ x: 0, y: 64 });
    const isInputFocusedRef = useRef(false);
    const isKeyboardActiveRef = useRef(false);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [keyboardViewportHeight, setKeyboardViewportHeight] = useState(null);
    const [showPlan, setShowPlan] = useState(false);
    const [_showGiveUpOptions, setShowGiveUpOptions] = useState(false);
    const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

    // Problem-specific coaching & progressive hint state
    const [hintHistory, setHintHistory] = useState([]);
    const [hintLevel, setHintLevel] = useState(0); // 0 = none, 1, 2, 3
    const [hasGivenUp, setHasGivenUp] = useState(propHasGivenUp);
    const [personalizedPlan, setPersonalizedPlan] = useState(null);
    const [onboardingProfile, setOnboardingProfile] = useState(null);

    useEffect(() => {
        setHasGivenUp(propHasGivenUp);
    }, [propHasGivenUp]);

    const coachStorageKey = userId ? `prepai:${userId}:dsa-coach` : null;

    const panelRef = useRef(null);
    const dragRef = useRef(null);
    const chatScrollRef = useRef(null);
    const isNearBottomRef = useRef(true);
    const resizeRef = useRef(null);
    const initializedRef = useRef(false);
    const audioContextRef = useRef(null);
    const lastTypingSoundRef = useRef(0);
    const soundEnabledRef = useRef(soundEnabled);
    const previousProblemRef = useRef(null);
    const requestInFlightRef = useRef(false);

    soundEnabledRef.current = soundEnabled;

    const isTyping = Boolean(typingMessageId);
    const hasActiveProblem = Boolean(activeProblem);
    const currentExecution = executionResults || runResults;
    const hasFailedExecution =
        Boolean(evaluationError) ||
        (currentExecution &&
            currentExecution.verdict &&
            currentExecution.verdict !== "Accepted");

    const unlockAudio = useCallback(() => {
        if (typeof window === "undefined") return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContextClass();
            }
            if (audioContextRef.current.state === "suspended") {
                audioContextRef.current.resume().catch(() => {});
            }
        } catch {
            // Audio unlock error handling
        }
    }, []);

    const sound = useCallback(
        (type) => {
            if (soundEnabled) {
                playCoachSound(type, audioContextRef, 0.08);
            }
        },
        [soundEnabled]
    );

    const clampPosition = useCallback(
        (x, y) => {
            if (typeof window === "undefined") {
                return { x, y };
            }

            const panel = panelRef.current;
            const width = panel?.offsetWidth ?? panelSize.width;
            const height = panel?.offsetHeight ?? panelSize.height;
            const isMobile = window.innerWidth < 768;
            const bottomMargin = isMobile ? 80 : 16;

            return {
                x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
                y: Math.max(12, Math.min(y, window.innerHeight - height - bottomMargin)),
            };
        },
        [panelSize.width, panelSize.height]
    );

    useEffect(() => {
        if (!isOpen || !panelRef.current) return;

        const width = panelRef.current.offsetWidth;

        setPosition((current) => {
            const initialX = current.x === 0 ? window.innerWidth - width - 24 : current.x;
            const clamped = clampPosition(initialX, current.y);
            userPositionRef.current = clamped;
            return clamped;
        });
    }, [isOpen, clampPosition]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleViewportChange = () => {
            if (!isOpen) return;

            const isMobile = window.innerWidth < 768;
            if (!isMobile) {
                // Desktop: Keep position clamped to screen bounds
                setPosition((current) => {
                    const next = clampPosition(current.x, current.y);
                    userPositionRef.current = next;
                    return next;
                });
                return;
            }

            // Mobile: inspect visualViewport
            const vv = window.visualViewport;
            const windowH = window.innerHeight;
            const vvHeight = vv ? vv.height : windowH;
            const vvTop = vv ? vv.offsetTop : 0;

            const isKeyboardUp =
                windowH - vvHeight > 140 ||
                (isInputFocusedRef.current && vvHeight < windowH * 0.88);

            if (isKeyboardUp) {
                isKeyboardActiveRef.current = true;
                setIsKeyboardOpen(true);
                setKeyboardViewportHeight(vvHeight);

                const maxAllowedPanelH = Math.max(200, Math.min(panelSize.height, vvHeight - 16));
                const targetY = vvTop + Math.max(8, vvHeight - maxAllowedPanelH - 8);

                // Adjust temporary display position without mutating userPositionRef.current
                setPosition((current) => ({
                    x: clampPosition(current.x, current.y).x,
                    y: Math.max(vvTop + 8, targetY),
                }));
            } else {
                isKeyboardActiveRef.current = false;
                setIsKeyboardOpen(false);
                setKeyboardViewportHeight(null);

                // Smoothly restore the user's intended position
                if (userPositionRef.current) {
                    const restored = clampPosition(
                        userPositionRef.current.x,
                        userPositionRef.current.y
                    );
                    setPosition(restored);
                }
            }
        };

        const vv = window.visualViewport;
        if (vv) {
            vv.addEventListener("resize", handleViewportChange);
            vv.addEventListener("scroll", handleViewportChange);
        }
        window.addEventListener("resize", handleViewportChange);

        return () => {
            if (vv) {
                vv.removeEventListener("resize", handleViewportChange);
                vv.removeEventListener("scroll", handleViewportChange);
            }
            window.removeEventListener("resize", handleViewportChange);
        };
    }, [isOpen, clampPosition, panelSize.height]);

    const addAssistantMessage = useCallback((text) => {
        const id = createId();

        setMessages((current) => [
            ...current,
            { id, role: "assistant", text, visibleText: "" },
        ]);

        setTypingMessageId(id);
    }, []);

    // Restore coach state from localStorage and backend on mount / userId change
    useEffect(() => {
        let isMounted = true;
        let hasRestoredFromStorage = false;
        if (coachStorageKey) {
            try {
                const raw = localStorage.getItem(coachStorageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
                        setMessages(parsed.messages);
                        hasRestoredFromStorage = true;
                    }
                    if (Array.isArray(parsed.hintHistory)) {
                        setHintHistory(parsed.hintHistory);
                    }
                    if (typeof parsed.hintLevel === "number") {
                        setHintLevel(parsed.hintLevel);
                    }
                    if (parsed.personalizedPlan) {
                        setPersonalizedPlan(parsed.personalizedPlan);
                    }
                    if (parsed.onboardingProfile) {
                        setOnboardingProfile(parsed.onboardingProfile);
                    }
                }
            } catch (err) {
                console.error("Failed to restore coach state from localStorage:", err);
            }
        }

        // Fetch authoritative study plan from server when authenticated
        if (isLoggedIn && getToken) {
            getToken().then(async (token) => {
                if (!token || !isMounted) {
                    if (!initializedRef.current && isMounted) {
                        initializedRef.current = true;
                        if (!hasRestoredFromStorage) {
                            addAssistantMessage(
                                "Hey! I'm Pepe, your PrepAI DSA Coach. 🚀\n\nI can help you build a personalized study plan, give progressive hints, explain algorithms, and debug failing test cases.\n\nTo get started, click **Let's Start** or tell me about your target companies, daily study time, or weak topics!"
                            );
                        }
                    }
                    return;
                }

                try {
                    const res = await axios.get(
                        `${import.meta.env.VITE_API_URL}/api/user/study-plan`,
                        {
                            headers: { Authorization: `Bearer ${token}` },
                        }
                    );
                    if (!isMounted) return;

                    const { onboardingProfile: serverProfile, plan: serverPlan } = res.data || {};
                    if (serverProfile) {
                        setOnboardingProfile(serverProfile);
                    }
                    if (serverPlan) {
                        setPersonalizedPlan(serverPlan);
                    }

                    if (!initializedRef.current) {
                        initializedRef.current = true;
                        if (!hasRestoredFromStorage) {
                            if (serverProfile || serverPlan) {
                                addAssistantMessage(
                                    "Welcome back! I have your personalized study plan saved. 🚀\n\nClick **My Plan** to review your schedule, request a problem to solve, or ask me any DSA questions!"
                                );
                            } else {
                                addAssistantMessage(
                                    "Hey! I'm Pepe, your PrepAI DSA Coach. 🚀\n\nI can help you build a personalized study plan, give progressive hints, explain algorithms, and debug failing test cases.\n\nTo get started, click **Let's Start** or tell me about your target companies, daily study time, or weak topics!"
                                );
                            }
                        }
                    }
                } catch (fetchErr) {
                    if (!isMounted) return;
                    console.warn("Failed to fetch study plan from server:", fetchErr.message);
                    if (!initializedRef.current) {
                        initializedRef.current = true;
                        if (!hasRestoredFromStorage) {
                            addAssistantMessage(
                                "Hey! I'm Pepe, your PrepAI DSA Coach. 🚀\n\nI can help you build a personalized study plan, give progressive hints, explain algorithms, and debug failing test cases.\n\nTo get started, click **Let's Start** or tell me about your target companies, daily study time, or weak topics!"
                            );
                        }
                    }
                }
            });
        } else {
            if (!initializedRef.current) {
                initializedRef.current = true;
                if (!hasRestoredFromStorage) {
                    addAssistantMessage(
                        "Hey! I'm Pepe, your PrepAI DSA Coach. 🚀\n\nI can help you build a personalized study plan, give progressive hints, explain algorithms, and debug failing test cases.\n\nTo get started, click **Let's Start** or tell me about your target companies, daily study time, or weak topics!"
                    );
                }
            }
        }

        return () => {
            isMounted = false;
        };
    }, [coachStorageKey, addAssistantMessage, isLoggedIn, getToken]);

    // Save coach state to localStorage
    useEffect(() => {
        if (!coachStorageKey || messages.length === 0) return;

        try {
            const stateToSave = {
                messages,
                hintHistory,
                hintLevel,
                personalizedPlan,
                onboardingProfile,
            };
            localStorage.setItem(coachStorageKey, JSON.stringify(stateToSave));
        } catch (err) {
            console.error("Failed to save coach state:", err);
        }
    }, [coachStorageKey, messages, hintHistory, hintLevel, personalizedPlan, onboardingProfile]);

    // Synchronize session reset when triggered from DsaArena
    const prevResetTriggerRef = useRef(resetTrigger);
    useEffect(() => {
        if (resetTrigger > 0 && resetTrigger !== prevResetTriggerRef.current) {
            prevResetTriggerRef.current = resetTrigger;
            setHintHistory([]);
            setHintLevel(0);
            if (onHintLevelChange) onHintLevelChange(0);
            setHasGivenUp(false);
            setShowGiveUpOptions(false);
            setShowPlan(false);
            const resetMsg = {
                id: createId(),
                role: "assistant",
                text: "Current session has been reset. The editor and conversation are clean and ready. What would you like to work on next?",
                visibleText: "Current session has been reset. The editor and conversation are clean and ready. What would you like to work on next?",
            };
            setMessages([resetMsg]);
            setTypingMessageId(null);
            if (coachStorageKey) {
                try {
                    localStorage.setItem(
                        coachStorageKey,
                        JSON.stringify({
                            messages: [resetMsg],
                            hintHistory: [],
                            hintLevel: 0,
                            personalizedPlan,
                            onboardingProfile,
                        })
                    );
                } catch (err) {
                    console.error("Failed to save reset coach state:", err);
                }
            }
        }
    }, [resetTrigger, coachStorageKey, personalizedPlan, onboardingProfile]);

    // Handle activeProblem changes: only reset problem hints when problem changes,
    // and do NOT wipe out onboarding or existing chat.
    useEffect(() => {
        if (!activeProblem) {
            previousProblemRef.current = null;
            return;
        }

        const problemIdentity =
            typeof activeProblem === "string"
                ? activeProblem
                : activeProblem.id ??
                activeProblem._id ??
                activeProblem.title ??
                activeProblem.problemId ??
                activeProblem;

        if (previousProblemRef.current === problemIdentity) return;

        const isInitialProblemLoad = previousProblemRef.current === null;
        previousProblemRef.current = problemIdentity;

        // Reset hints and give-up state when switching to a completely new problem
        if (!isInitialProblemLoad) {
            setHintHistory([]);
            setHintLevel(0);
            setHasGivenUp(false);
            setShowGiveUpOptions(false);
            addAssistantMessage(
                `New problem loaded: **${activeProblem.title || "DSA Problem"}**. Try solving it independently first! Whenever you need a push, click Hint.`
            );
        }
    }, [activeProblem, addAssistantMessage]);

    const typingMessage = messages.find(
        (item) => item.id === typingMessageId
    );
    // Typing sound and chunking effect
    useEffect(() => {
        if (!typingMessageId) return;

        const message = typingMessage;
        if (!message) {
            setTypingMessageId(null);
            return;
        }

        let index = 0;
        const chunkSize = 4;

        const interval = window.setInterval(() => {
            index = Math.min(index + chunkSize, message.text.length);

            setMessages((current) =>
                current.map((item) =>
                    item.id === typingMessageId
                        ? { ...item, visibleText: item.text.slice(0, index) }
                        : item
                )
            );

            const now = Date.now();

            if (
                soundEnabledRef.current &&
                now - lastTypingSoundRef.current >= 60
            ) {
                lastTypingSoundRef.current = now;
                playCoachSound("typing", audioContextRef, 0.08);
            }

            if (index >= message.text.length) {
                window.clearInterval(interval);
                setTypingMessageId(null);
            }
        }, 25);

        return () => window.clearInterval(interval);
    }, [typingMessageId, typingMessage?.text]);

    useEffect(() => {
        const container = chatScrollRef.current;
        if (!container || !isNearBottomRef.current) return;
        container.scrollTop = container.scrollHeight;
    }, [messages, showPlan, isRequesting]);

    // Central request handler for conversational chat, progressive hints, approach, solution, and debug
    const requestCoachAnswer = useCallback(
        async (action, extraPayload = {}) => {
            if (isRequesting || requestInFlightRef.current) return;

            if (!isLoggedIn) {
                openLogin();
                addAssistantMessage("Please sign in to use the AI DSA Coach.");
                return;
            }

            requestInFlightRef.current = true;
            setIsRequesting(true);
            setExpression("thinking");
            sound("thinking");

            try {
                const token = await getToken();

                if (!token) {
                    throw new Error("Your Clerk session is not ready. Please try again.");
                }

                const nextHintLevel = action === "hint" ? Math.min(3, hintLevel + 1) : hintLevel;

                const effectiveExecution =
                    executionResults ||
                    runResults ||
                    (evaluationError
                        ? {
                              verdict:
                                  typeof evaluationError === "string" &&
                                  /syntax|compile|compilation|syntaxerror/i.test(evaluationError)
                                      ? "Compilation Error"
                                      : "Runtime Error",
                              error: typeof evaluationError === "string" ? evaluationError : (evaluationError.error || JSON.stringify(evaluationError)),
                              passed: 0,
                              total: activeProblem?.testCases?.length || 0,
                          }
                        : null);

                const payload = {
                    action,
                    message: extraPayload.message || "",
                    history: messages.slice(-8),
                    problem: activeProblem,
                    code,
                    language,
                    hintLevel: nextHintLevel,
                    previousHints: hintHistory,
                    onboardingProfile,
                    plan: personalizedPlan,
                    execution: effectiveExecution,
                    evaluationError: evaluationError || null,
                    ...extraPayload,
                };

                const response = await axios.post(
                    `${import.meta.env.VITE_API_URL}/api/coach-chat`,
                    payload,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                const {
                    answer,
                    action: responseAction,
                    problem: generatedProblem,
                    topic: loadedTopic,
                    difficulty: loadedDiff,
                    plan: newPlan,
                    onboardingProfile: newProfile,
                } = response.data || {};

                if (typeof answer !== "string" || !answer.trim()) {
                    throw new Error("The AI returned an empty response. Please try again.");
                }

                if (newProfile && typeof newProfile === "object") {
                    setOnboardingProfile(newProfile);
                }

                if (newPlan && typeof newPlan === "object") {
                    setPersonalizedPlan(newPlan);
                    setShowPlan(true);

                    trackEvent(ALLOWED_EVENTS.STUDY_PLAN_CREATED, {
                        daily_target: Number(newPlan?.dailyTarget) || 1,
                        has_topics: Boolean(newProfile?.weakTopics || onboardingProfile?.weakTopics),
                        plan_type: "coach_personalized",
                    });
                }

                if (isLoggedIn && (newProfile || newPlan)) {
                    getToken().then(async (tok) => {
                        if (!tok) return;
                        try {
                            await axios.put(
                                `${import.meta.env.VITE_API_URL}/api/user/study-plan`,
                                {
                                    onboardingProfile: newProfile || onboardingProfile,
                                    plan: newPlan || personalizedPlan,
                                },
                                {
                                    headers: { Authorization: `Bearer ${tok}` },
                                }
                            );
                        } catch (putErr) {
                            console.warn("Failed to sync study plan to server:", putErr.message);
                        }
                    });
                }

                if (responseAction === "load_problem" && generatedProblem) {
                    if (onLoadProblem) {
                        try {
                            const loaded = onLoadProblem(generatedProblem, loadedTopic, loadedDiff);
                            if (loaded !== false) {
                                setHintHistory([]);
                                setHintLevel(0);
                                if (onHintLevelChange) {
                                    try {
                                        onHintLevelChange(0);
                                    } catch (hintErr) {
                                        console.warn("onHintLevelChange callback failed:", hintErr);
                                    }
                                }
                                setHasGivenUp(false);
                                setShowGiveUpOptions(false);
                            }
                        } catch (loadErr) {
                            console.error("Failed to load problem into DSA Arena:", loadErr);
                        }
                    }
                }

                if (action === "hint") {
                    setHintLevel(nextHintLevel);
                    if (onHintLevelChange) {
                        try {
                            onHintLevelChange(nextHintLevel);
                        } catch (hintErr) {
                            console.warn("onHintLevelChange callback failed:", hintErr);
                        }
                    }
                    setHintHistory((prev) => [...prev, answer.trim()]);
                }

                if (action === "solution") {
                    setHasGivenUp(true);
                    if (onGiveUp) {
                        try {
                            onGiveUp();
                        } catch (giveUpErr) {
                            console.warn("onGiveUp callback failed:", giveUpErr);
                        }
                    }
                }

                setExpression("happy");
                addAssistantMessage(answer.trim());
            } catch (error) {
                console.error(`DSA Coach ${action} request failed:`, error);

                const status = error.response?.status;
                const providerMessage = [
                    error.response?.data?.error,
                    error.message,
                ].filter(Boolean).join(" ");

                let message;

                if (
                    status === 503 ||
                    /high demand|service unavailable|overloaded|temporarily unavailable/i.test(providerMessage)
                ) {
                    message =
                        "The AI service is experiencing high demand right now. Please try again in a moment.";
                } else {
                    message =
                        "Something went wrong while processing your request. Please try again.";
                }

                addAssistantMessage(`I couldn't complete that request. ${message}`);
            } finally {
                requestInFlightRef.current = false;
                setIsRequesting(false);
            }
        },
        [
            isRequesting,
            isLoggedIn,
            openLogin,
            getToken,
            hintLevel,
            messages,
            activeProblem,
            code,
            language,
            hintHistory,
            onboardingProfile,
            personalizedPlan,
            executionResults,
            runResults,
            sound,
            onLoadProblem,
            onGiveUp,
            addAssistantMessage,
        ]
    );

    // Reset current session
    const handleResetSession = useCallback(() => {
        sound("thinking");
        setHintHistory([]);
        setHintLevel(0);
        setHasGivenUp(false);
        setShowGiveUpOptions(false);
        setShowPlan(false);

        const resetMsg = {
            id: createId(),
            role: "assistant",
            text: "Current session has been reset. The editor and conversation are clean and ready. What would you like to work on next?",
            visibleText: "Current session has been reset. The editor and conversation are clean and ready. What would you like to work on next?",
        };
        setMessages([resetMsg]);
        setTypingMessageId(null);

        if (coachStorageKey) {
            try {
                localStorage.setItem(
                    coachStorageKey,
                    JSON.stringify({
                        messages: [resetMsg],
                        hintHistory: [],
                        hintLevel: 0,
                        personalizedPlan,
                        onboardingProfile,
                    })
                );
            } catch (err) {
                console.error("Failed to save reset coach state:", err);
            }
        }

        if (onResetSession) {
            onResetSession();
        }
    }, [sound, onResetSession, coachStorageKey, personalizedPlan, onboardingProfile]);

    // Clear all saved coach data
    const handleClearAllData = useCallback(async () => {
        setIsRequesting(true);
        sound("thinking");

        try {
            const token = await getToken();
            if (token) {
                await axios.post(
                    `${import.meta.env.VITE_API_URL}/api/coach-clear`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );
            }
        } catch (err) {
            console.error("Failed to clear backend coach data:", err);
        } finally {
            setIsRequesting(false);
        }

        if (coachStorageKey) {
            localStorage.removeItem(coachStorageKey);
        }

        if (onClearAllCoachData) {
            onClearAllCoachData();
        }

        setHintHistory([]);
        setHintLevel(0);
        setHasGivenUp(false);
        setPersonalizedPlan(null);
        setOnboardingProfile(null);
        setShowPlan(false);
        setShowGiveUpOptions(false);

        const initialText =
            "All Pepe AI Coach data has been cleared. Ready for a fresh start! Tell me about your target companies, daily study time, or start solving a DSA problem.";
        const id = createId();
        setMessages([{ id, role: "assistant", text: initialText, visibleText: initialText }]);
        setTypingMessageId(null);
    }, [getToken, coachStorageKey, onClearAllCoachData, sound]);

    const sendUserMessage = useCallback(
        (text, actionOverride = null) => {
            const trimmed = text.trim();

            if (!trimmed || typingMessageId || isRequesting || requestInFlightRef.current) return;

            if (!isLoggedIn) {
                openLogin();
                return;
            }

            sound("send");
            setShowPlan(false);

            setMessages((current) => [
                ...current,
                {
                    id: createId(),
                    role: "user",
                    text: trimmed,
                    visibleText: trimmed,
                },
            ]);

            setInput("");

            const normalized = trimmed.toLowerCase();

            if (actionOverride) {
                void requestCoachAnswer(actionOverride, { message: trimmed });
                return;
            }

            if (
                normalized === "my plan" ||
                normalized === "show plan" ||
                normalized === "study plan"
            ) {
                setShowPlan(true);
                return;
            }

            if (normalized === "reset session") {
                handleResetSession();
                return;
            }

            if (normalized === "clear data" || normalized === "clear all coach data") {
                setShowClearConfirmModal(true);
                return;
            }

            const isExplicitGiveUp =
                normalized === "give up" ||
                normalized === "i give up" ||
                normalized === "i give up." ||
                normalized.startsWith("i give up on") ||
                normalized.startsWith("give up on") ||
                normalized === "show solution" ||
                normalized === "give me the solution" ||
                normalized === "solution";

            if (isExplicitGiveUp) {
                setHasGivenUp(true);
                if (onGiveUp) onGiveUp();
                void requestCoachAnswer("solution", { message: trimmed });
                return;
            }

            if (normalized.includes("give me a hint") || normalized === "hint") {
                const nextLevel = Math.min(3, hintLevel + 1);
                void requestCoachAnswer("hint", { message: `Give me Hint ${nextLevel}` });
                return;
            }

            if (
                normalized.includes("explain approach") ||
                normalized.includes("explain my approach") ||
                normalized.includes("review my approach")
            ) {
                void requestCoachAnswer("approach", { message: trimmed });
                return;
            }

            const isDebugIntent =
                normalized.includes("debug") ||
                normalized.includes("why did my code fail") ||
                normalized.includes("why did it fail") ||
                normalized.includes("why is my code failing") ||
                normalized.includes("why is my code wrong") ||
                normalized.includes("why did my test") ||
                normalized.includes("where is the bug") ||
                normalized.includes("what is wrong with my code") ||
                normalized.includes("why does it fail");

            if (isDebugIntent) {
                void requestCoachAnswer("debug", { message: trimmed });
                return;
            }

            // Normal free-form conversational chat
            void requestCoachAnswer("chat", { message: trimmed });
        },
        [
            typingMessageId,
            isRequesting,
            isLoggedIn,
            openLogin,
            sound,
            requestCoachAnswer,
            handleResetSession,
            hintLevel,
            onGiveUp,
        ]
    );

    const handleStart = () => {
        if (!isLoggedIn) {
            openLogin();
            return;
        }

        if (typingMessageId || isRequesting) return;

        setShowPlan(false);
        setShowGiveUpOptions(false);
        sound("send");

        if (onboardingProfile || personalizedPlan) {
            setMessages((current) => [
                ...current,
                {
                    id: createId(),
                    role: "user",
                    text: "Update My Study Plan",
                    visibleText: "Update My Study Plan",
                },
            ]);

            const target = onboardingProfile?.targetCompanies
                ? `your focus on **${onboardingProfile.targetCompanies}**`
                : "your interview prep";
            const time = onboardingProfile?.dailyTime
                ? ` (${onboardingProfile.dailyTime})`
                : "";

            addAssistantMessage(
                `Let's refine your plan!\n\nCurrently, I have ${target}${time} recorded.\n\nWould you like to adjust your **target companies**, **weak topics**, or **daily study time**? Just reply with whatever you'd like to update!`
            );
        } else {
            setMessages((current) => [
                ...current,
                {
                    id: createId(),
                    role: "user",
                    text: "Let's Start Onboarding",
                    visibleText: "Let's Start Onboarding",
                },
            ]);

            addAssistantMessage(
                "Welcome! Let's tailor your preparation:\n\n1. Which **target companies** are you aiming for?\n2. What **DSA topics** have you covered so far?\n3. Which topics feel **weakest**?\n4. How many **hours or minutes** can you study daily?\n\nAnswer any or all of these, and I'll generate a personalized study plan for you!"
            );
        }
    };

    const handleMyPlan = () => {
        if (!isLoggedIn) {
            openLogin();
            return;
        }
        if (typingMessageId || isRequesting) return;
        sound("send");
        setShowPlan((prev) => !prev);
    };

    const handleHint = () => {
        unlockAudio();
        if (!isLoggedIn) {
            openLogin();
            return;
        }
        if (isRequesting || requestInFlightRef.current || Boolean(typingMessageId)) return;
        setShowGiveUpOptions(false);
        const nextLevel = Math.min(3, hintLevel + 1);
        sendUserMessage(`Give me Hint ${nextLevel}`, "hint");
    };

    const handleGiveUp = () => {
        unlockAudio();
        if (!isLoggedIn) {
            openLogin();
            return;
        }
        if (isRequesting || requestInFlightRef.current || Boolean(typingMessageId)) return;
        setShowGiveUpOptions(false);
        setHasGivenUp(true);
        if (onGiveUp) onGiveUp();
        addAssistantMessage(
            "It's completely fine to step back and study the solution! I've unlocked the **Explain Approach** and **Solution** buttons below so you can master the optimal technique."
        );
    };

    const handleExplainApproach = () => {
        unlockAudio();
        if (!isLoggedIn) {
            openLogin();
            return;
        }
        if (isRequesting || requestInFlightRef.current || Boolean(typingMessageId)) return;
        setShowGiveUpOptions(false);
        sendUserMessage("Explain approach", "approach");
    };

    const handleShowSolution = () => {
        unlockAudio();
        if (!isLoggedIn) {
            openLogin();
            return;
        }
        if (isRequesting || requestInFlightRef.current || Boolean(typingMessageId)) return;
        setShowGiveUpOptions(false);
        setHasGivenUp(true);
        if (onGiveUp) onGiveUp();
        sendUserMessage("Show solution", "solution");
    };

    const handleDebugSolution = () => {
        unlockAudio();
        if (!isLoggedIn) {
            openLogin();
            return;
        }
        if (isRequesting || requestInFlightRef.current || Boolean(typingMessageId)) return;
        setShowGiveUpOptions(false);
        sendUserMessage("Can you help debug why my code failed the test cases?", "debug");
    };

    const startDragging = (event) => {
        if (event.button !== 0 || event.target.closest("button")) return;

        event.preventDefault();

        dragRef.current = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            startX: position.x,
            startY: position.y,
        };

        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const dragPanel = (event) => {
        if (!dragRef.current) return;

        const drag = dragRef.current;
        const newPos = clampPosition(
            drag.startX + event.clientX - drag.pointerX,
            drag.startY + event.clientY - drag.pointerY
        );

        userPositionRef.current = newPos;
        setPosition(newPos);
    };

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={() => {
                    unlockAudio();
                    setIsOpen(true);
                }}
                aria-label="Open PrepAI DSA Coach"
                title="Open PrepAI Coach"
                className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-5 right-4 md:right-5 z-[80] h-14 w-14 rounded-full border border-text-secondary/30 bg-surface p-1 shadow-xl transition hover:scale-105 flex items-center justify-center overflow-hidden"
            >
                <PepeAvatar
                    isSpeaking={isTyping}
                    isThinking={isRequesting || expression === "thinking"}
                    isCelebrating={expression === "celebrating"}
                    size="custom"
                    className="w-full h-full"
                />
                <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-500" />
            </button>
        );
    }

    return (
        <div
            className={`fixed z-[80] ${isKeyboardOpen ? "transition-[top,height] duration-200 ease-out" : ""}`}
            style={{
                left: position.x,
                top: position.y,
                width: `min(${panelSize.width}px, calc(100vw - 24px))`,
            }}
        >
            <div className="pointer-events-none absolute -left-[58px] top-0 hidden h-[54px] w-[54px] sm:block">
                <PepeAvatar
                    isSpeaking={isTyping}
                    isThinking={isRequesting || expression === "thinking"}
                    isCelebrating={expression === "celebrating"}
                    size="custom"
                    className="w-full h-full"
                    withBody={true}
                />
            </div>

            <section
                ref={panelRef}
                aria-label="PrepAI DSA Coach"
                style={{
                    height: isKeyboardOpen && keyboardViewportHeight
                        ? `${Math.max(200, Math.min(panelSize.height, keyboardViewportHeight - 16))}px`
                        : `min(${panelSize.height}px, calc(100vh - 24px))`,
                    maxWidth: "100%",
                }}
                className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-text-secondary/25 bg-surface text-text-primary shadow-xl"
            >
                <header
                    onPointerDown={(event) => {
                        unlockAudio();
                        startDragging(event);
                    }}
                    onPointerMove={dragPanel}
                    onPointerUp={() => {
                        dragRef.current = null;
                    }}
                    onPointerCancel={() => {
                        dragRef.current = null;
                    }}
                    className="flex shrink-0 touch-none cursor-grab items-center gap-2 border-b border-text-secondary/20 px-3 py-2 active:cursor-grabbing"
                >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="sm:hidden h-7 w-7 sm:h-8 sm:w-8 shrink-0 flex items-center justify-center">
                            <PepeAvatar
                                isSpeaking={isTyping}
                                isThinking={isRequesting || expression === "thinking"}
                                isCelebrating={expression === "celebrating"}
                                size="custom"
                                className="w-full h-full"
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-sm font-semibold truncate">PrepAI Coach</h2>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500 shrink-0">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    DSA mentor
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => {
                                unlockAudio();
                                setSoundEnabled((prev) => !prev);
                            }}
                            aria-label={soundEnabled ? "Mute typing sound" : "Enable typing sound"}
                            title={soundEnabled ? "Mute typing sound" : "Enable typing sound"}
                            className={`shrink-0 rounded-lg p-1.5 transition ${soundEnabled
                                ? "text-emerald-400 hover:bg-emerald-500/10"
                                : "text-text-secondary hover:bg-text-secondary/10"
                                }`}
                        >
                            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                        </button>

                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={handleResetSession}
                            aria-label="Reset session"
                            title="Reset current session"
                            className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-text-secondary/10 hover:text-text-primary transition"
                        >
                            <RotateCcw size={15} />
                        </button>

                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => setShowClearConfirmModal(true)}
                            aria-label="Clear all coach data"
                            title="Clear all saved coach data"
                            className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-red-500/10 hover:text-red-500 transition"
                        >
                            <Trash2 size={15} />
                        </button>

                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => setIsOpen(false)}
                            aria-label="Minimize coach"
                            className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-text-secondary/10"
                        >
                            <Minus size={17} />
                        </button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col">
                    <div
                        ref={chatScrollRef}
                        onScroll={(event) => {
                            const element = event.currentTarget;
                            isNearBottomRef.current =
                                element.scrollHeight - element.scrollTop - element.clientHeight < 100;
                        }}
                        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2.5"
                    >
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                                    }`}
                            >
                                <div
                                    className={`max-w-[96%] min-w-0 rounded-xl px-3 py-2 text-sm leading-5 ${message.role === "user"
                                        ? "rounded-br-sm bg-blue-600 text-white"
                                        : "rounded-bl-sm bg-text-secondary/[0.08] text-text-primary"
                                        }`}
                                >
                                    <MessageContent
                                        text={message.visibleText}
                                        typing={message.id === typingMessageId}
                                    />
                                </div>
                            </div>
                        ))}

                        {isRequesting && (
                            <div className="rounded-lg bg-text-secondary/[0.08] px-3 py-2 text-xs text-text-secondary">
                                Pepe is thinking...
                            </div>
                        )}

                        {showPlan && (
                            <div className="rounded-xl bg-text-secondary/[0.06] p-3 text-sm">
                                <PlanCard
                                    plan={personalizedPlan}
                                    onboardingProfile={onboardingProfile}
                                    onPersonalize={() => sendUserMessage("Help me personalize my study plan")}
                                    onRestartOnboarding={handleStart}
                                    isTyping={isTyping}
                                    isRequesting={isRequesting}
                                />
                            </div>
                        )}
                    </div>

                    {!isTyping && !isRequesting && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-text-secondary/15 px-2.5 py-2">
                            {hasActiveProblem ? (
                                <>
                                    {!hasGivenUp ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleHint}
                                                disabled={isRequesting || Boolean(typingMessageId)}
                                                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-semibold text-amber-500 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Get a progressive hint for the active problem"
                                            >
                                                <Lightbulb size={13} />
                                                <span>Hint</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleGiveUp}
                                                disabled={isRequesting || Boolean(typingMessageId)}
                                                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-text-secondary/20 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition hover:bg-text-secondary/10 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Give up on solving this problem and reveal approach & solution"
                                            >
                                                <AlertCircle size={13} />
                                                <span>Give Up</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleExplainApproach}
                                                disabled={isRequesting || Boolean(typingMessageId)}
                                                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-text-secondary/20 px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-text-secondary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Explain the algorithmic approach for this problem"
                                            >
                                                <Lightbulb size={13} />
                                                <span>Explain Approach</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleShowSolution}
                                                disabled={isRequesting || Boolean(typingMessageId)}
                                                className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="Show the complete reference solution"
                                            >
                                                <Sparkles size={13} />
                                                <span>Solution</span>
                                            </button>
                                        </>
                                    )}

                                    {hasFailedExecution && (
                                        <button
                                            type="button"
                                            onClick={handleDebugSolution}
                                            disabled={isRequesting || Boolean(typingMessageId)}
                                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold text-red-500 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                            title="Debug why your code failed test cases"
                                        >
                                            <Bug size={13} />
                                            <span>Debug</span>
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleMyPlan}
                                        disabled={isRequesting || Boolean(typingMessageId)}
                                        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-text-secondary/20 px-2.5 py-1.5 text-[11px] font-medium transition hover:bg-text-secondary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                        title="View or edit your personalized study plan"
                                    >
                                        <CalendarDays size={13} />
                                        <span>{showPlan ? "Hide Plan" : "My Plan"}</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleStart}
                                        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
                                    >
                                        <Sparkles size={14} />
                                        {onboardingProfile || personalizedPlan ? "Update Plan" : "Let's Start"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleMyPlan}
                                        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-text-secondary/20 px-3 py-1.5 text-xs font-medium transition hover:bg-text-secondary/10"
                                    >
                                        <CalendarDays size={14} />
                                        {showPlan ? "Hide Plan" : "My Plan"}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {showClearConfirmModal && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                            <div className="w-full max-w-xs rounded-xl border border-red-500/30 bg-surface p-4 shadow-2xl">
                                <h3 className="text-sm font-bold text-red-500 flex items-center gap-1.5">
                                    <AlertTriangle size={16} />
                                    Clear All Coach Data?
                                </h3>
                                <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                                    This will permanently delete your coach conversation history, saved study plan, onboarding profile, and DSA drafts. This cannot be undone.
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowClearConfirmModal(false)}
                                        className="flex-1 rounded-lg border border-text-secondary/20 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-text-secondary/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowClearConfirmModal(false);
                                            void handleClearAllData();
                                        }}
                                        className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                                    >
                                        Yes, Clear
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isLoggedIn ? (
                        <div className="flex items-center justify-between gap-3 border-t border-text-secondary/20 bg-surface/90 px-3 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                                <Lock size={15} className="shrink-0 text-amber-500" />
                                <span className="text-xs text-text-secondary truncate">
                                    Sign in to chat with Pepe & access AI tools
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={openLogin}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 transition"
                            >
                                <LogIn size={13} />
                                <span>Sign In</span>
                            </button>
                        </div>
                    ) : (
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                unlockAudio();
                                sendUserMessage(input);
                            }}
                            className="flex shrink-0 items-center gap-2 border-t border-text-secondary/20 p-2"
                        >
                            <input
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onFocus={() => {
                                    isInputFocusedRef.current = true;
                                    unlockAudio();
                                    if (typeof window !== "undefined" && window.innerWidth < 768) {
                                        setTimeout(() => {
                                            const vv = window.visualViewport;
                                            if (vv && vv.height < window.innerHeight * 0.88) {
                                                isKeyboardActiveRef.current = true;
                                                setIsKeyboardOpen(true);
                                                setKeyboardViewportHeight(vv.height);
                                                const maxAllowedPanelH = Math.max(200, Math.min(panelSize.height, vv.height - 16));
                                                const targetY = (vv.offsetTop || 0) + Math.max(8, vv.height - maxAllowedPanelH - 8);
                                                setPosition((current) => ({
                                                    x: clampPosition(current.x, current.y).x,
                                                    y: Math.max((vv.offsetTop || 0) + 8, targetY),
                                                }));
                                            }
                                        }, 120);
                                    }
                                }}
                                onBlur={() => {
                                    isInputFocusedRef.current = false;
                                    setTimeout(() => {
                                        if (!isInputFocusedRef.current && typeof window !== "undefined") {
                                            const vv = window.visualViewport;
                                            const vvH = vv ? vv.height : window.innerHeight;
                                            if (window.innerHeight - vvH < 100) {
                                                isKeyboardActiveRef.current = false;
                                                setIsKeyboardOpen(false);
                                                setKeyboardViewportHeight(null);
                                                if (userPositionRef.current) {
                                                    setPosition(clampPosition(userPositionRef.current.x, userPositionRef.current.y));
                                                }
                                            }
                                        }
                                    }, 200);
                                }}
                                onClick={unlockAudio}
                                disabled={isTyping || isRequesting}
                                placeholder="Ask your DSA coach..."
                                aria-label="Message PrepAI Coach"
                                className="min-w-0 flex-1 rounded-lg border border-text-secondary/25 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-emerald-500 disabled:opacity-60"
                            />

                            <button
                                type="submit"
                                onClick={unlockAudio}
                                disabled={!input.trim() || isTyping || isRequesting}
                                aria-label="Send message"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Send size={15} />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    unlockAudio();
                                    setSoundEnabled((enabled) => !enabled);
                                }}
                                aria-label={soundEnabled ? "Mute coach sounds" : "Enable coach sounds"}
                                title={soundEnabled ? "Mute sounds" : "Enable sounds"}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-text-secondary/20 text-text-secondary hover:bg-text-secondary/10"
                            >
                                {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                            </button>
                        </form>
                    )}
                </div>

                <div
                    role="separator"
                    aria-label="Resize PrepAI Coach"
                    title="Drag to resize"
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        resizeRef.current = {
                            pointerX: event.clientX,
                            pointerY: event.clientY,
                            width: panelSize.width,
                            height: panelSize.height,
                        };

                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (!resizeRef.current) return;

                        const start = resizeRef.current;

                        const nextWidth = Math.max(
                            340,
                            Math.min(850, start.width + event.clientX - start.pointerX)
                        );

                        const nextHeight = Math.max(
                            300,
                            Math.min(
                                window.innerHeight - 24,
                                start.height + event.clientY - start.pointerY
                            )
                        );

                        setPanelSize({ width: nextWidth, height: nextHeight });
                        setPosition((current) => clampPosition(current.x, current.y));
                    }}
                    onPointerUp={() => {
                        resizeRef.current = null;
                    }}
                    onPointerCancel={() => {
                        resizeRef.current = null;
                    }}
                    className="absolute bottom-0 right-0 z-20 flex h-6 w-6 touch-none cursor-nwse-resize items-end justify-end rounded-tl-lg bg-surface/90 pr-1 pb-0.5 text-sm text-text-secondary"
                >
                    ⤡
                </div>
            </section>
        </div>
    );
}
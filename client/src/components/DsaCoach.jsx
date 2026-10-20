import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";

const createId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function PrepAIRobot({ speaking = false, expression = "happy" }) {
    return (
        <svg
            viewBox="0 0 160 160"
            className="h-full w-full"
            role="img"
            aria-label="PrepAI robot"
        >
            <defs>
                <linearGradient id="prepRobotBody" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#93c5fd" />
                    <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
                <linearGradient id="prepRobotFace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#263650" />
                    <stop offset="100%" stopColor="#111827" />
                </linearGradient>
            </defs>

            <path d="M80 21 V11" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" />
            <circle cx="80" cy="8" r="7" fill="#60a5fa" />
            <rect x="18" y="63" width="17" height="36" rx="8" fill="#60a5fa" />
            <rect x="125" y="63" width="17" height="36" rx="8" fill="#60a5fa" />

            <rect x="28" y="27" width="104" height="91" rx="29" fill="url(#prepRobotBody)" />
            <rect x="38" y="38" width="84" height="70" rx="21" fill="url(#prepRobotFace)" />

            <ellipse cx="59" cy="65" rx="7" ry="9" fill="#93c5fd" />
            <ellipse cx="101" cy="65" rx="7" ry="9" fill="#93c5fd" />

            {speaking ? (
                <rect
                    className="dsa-robot-mouth"
                    x="68"
                    y="80"
                    width="24"
                    height="7"
                    rx="4"
                    fill="#93c5fd"
                />
            ) : expression === "thinking" || expression === "confused" ? (
                <path
                    d={expression === "confused" ? "M67 88 Q80 94 93 85" : "M67 88 Q80 80 93 88"}
                    fill="none"
                    stroke="#93c5fd"
                    strokeWidth="4"
                    strokeLinecap="round"
                />
            ) : expression === "celebrating" ? (
                <path
                    d="M64 83 Q80 103 96 83"
                    fill="none"
                    stroke="#93c5fd"
                    strokeWidth="4"
                    strokeLinecap="round"
                />
            ) : (
                <rect x="68" y="80" width="24" height="7" rx="4" fill="#93c5fd" />
            )}

            <path d="M49 117 Q80 108 111 117 L119 145 Q80 158 41 145 Z" fill="#dbeafe" />
            <rect x="64" y="124" width="32" height="15" rx="7" fill="#2563eb" />
            <circle cx="80" cy="131.5" r="3" fill="#bfdbfe" />
            <path d="M47 123 L33 137" stroke="#60a5fa" strokeWidth="9" strokeLinecap="round" />
            <path d="M113 123 L127 137" stroke="#60a5fa" strokeWidth="9" strokeLinecap="round" />
        </svg>
    );
}

function playCoachSound(type, audioContextRef, volume = 0.12) {
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
            envelope.gain.setValueAtTime(0.001, start);
            envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
            envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);

            oscillator.connect(envelope);
            envelope.connect(ctx.destination);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.015);
        };

        if (type === "typing") {
            tone(950 + Math.random() * 250, now, 0.025, "square", 0.018);
        } else if (type === "thinking") {
            tone(480, now, 0.12, "sine", 0.045);
            tone(620, now + 0.12, 0.16, "sine", 0.045);
        } else if (type === "confused") {
            tone(420, now, 0.13, "triangle", 0.05);
            tone(300, now + 0.15, 0.2, "triangle", 0.05);
        } else if (type === "celebrating") {
            tone(523.25, now, 0.14, "sine", 0.06);
            tone(659.25, now + 0.13, 0.14, "sine", 0.06);
            tone(783.99, now + 0.26, 0.24, "sine", 0.06);
        } else if (type === "send") {
            tone(700, now, 0.07, "sine", 0.035);
            tone(950, now + 0.06, 0.08, "sine", 0.035);
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
        const tokens = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

        const result = tokens.map((token, index) => {
            const key = `${keyPrefix}-${index}`;

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

function PlanCard() {
    const days = [
        { day: "Monday", topic: "Arrays", task: "Solve 2 problems" },
        { day: "Tuesday", topic: "Strings", task: "Solve 2 problems" },
        { day: "Wednesday", topic: "Binary search", task: "Solve 2 problems" },
        { day: "Thursday", topic: "Linked lists", task: "Solve 2 problems" },
        { day: "Friday", topic: "Recursion", task: "Solve 2 problems" },
        { day: "Saturday", topic: "Mixed practice", task: "Solve 2 problems" },
        { day: "Sunday", topic: "Review", task: "Revisit mistakes" },
    ];

    return (
        <div className="space-y-3">
            <div>
                <div className="flex items-center gap-2 font-semibold">
                    <CalendarDays size={16} />
                    Your starter DSA plan
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                    A default weekly template. It isn't personalized to your progress yet.
                </p>
            </div>

            <div className="space-y-2">
                {days.map((item) => (
                    <div
                        key={item.day}
                        className="flex items-center gap-3 rounded-lg border border-text-secondary/15 p-2"
                    >
                        <div className="w-[76px] shrink-0 text-xs font-medium">{item.day}</div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{item.topic}</p>
                            <p className="text-xs text-text-secondary">{item.task}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-lg bg-emerald-500/10 p-3 text-xs leading-5">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                    <Target size={14} />
                    Daily routine
                </div>
                Aim for 45–60 minutes: revise a concept, solve problems independently,
                and record mistakes to review later.
            </div>

            <div className="flex items-start gap-2 text-xs text-text-secondary">
                <TrendingUp size={14} className="mt-0.5 shrink-0" />
                Personalization using saved solved problems and weak topics can be
                connected once that data is exposed to this component.
            </div>
        </div>
    );
}

export default function DsaCoach({
    activeProblem = null,
    code = "",
    language = "javascript",
}) {
    const { getToken, isLoggedIn } = useAuth();

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [typingMessageId, setTypingMessageId] = useState(null);
    const [expression, setExpression] = useState("happy");
    const [input, setInput] = useState("");
    const [soundEnabled, setSoundEnabled] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 64 });
    const [panelSize, setPanelSize] = useState({ width: 350, height: 300 });
    const [showPlan, setShowPlan] = useState(false);
    const [showGiveUpOptions, setShowGiveUpOptions] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

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

    const sound = useCallback(
        (type) => {
            if (soundEnabled) {
                playCoachSound(type, audioContextRef, 0.12);
            }
        },
        [soundEnabled]
    );

    const clampPosition = useCallback(
        (x, y) => {
            const panel = panelRef.current;
            const width = panel?.offsetWidth ?? panelSize.width;
            const height = panel?.offsetHeight ?? panelSize.height;

            return {
                x: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
                y: Math.max(12, Math.min(y, window.innerHeight - height - 12)),
            };
        },
        [panelSize.width, panelSize.height]
    );

    useEffect(() => {
        if (!isOpen || !panelRef.current) return;

        const width = panelRef.current.offsetWidth;

        setPosition((current) =>
            clampPosition(
                current.x === 0 ? window.innerWidth - width - 24 : current.x,
                current.y
            )
        );
    }, [isOpen, clampPosition]);

    useEffect(() => {
        const handleResize = () => {
            setPosition((current) => clampPosition(current.x, current.y));
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [clampPosition]);

    const addAssistantMessage = useCallback((text) => {
        const id = createId();

        setMessages((current) => [
            ...current,
            { id, role: "assistant", text, visibleText: "" },
        ]);

        setTypingMessageId(id);
    }, []);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        addAssistantMessage(
            "Hey! I'm your PrepAI DSA coach. Start a session, or open My Plan to see a starter weekly study schedule."
        );
    }, [addAssistantMessage]);

    useEffect(() => {
        if (!activeProblem) {
            previousProblemRef.current = null;
            setShowGiveUpOptions(false);
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

        previousProblemRef.current = problemIdentity;
        setShowGiveUpOptions(false);
        setShowPlan(false);

        addAssistantMessage(
            "Your DSA question is ready. Try solving it independently first. Ask for a hint if you get stuck."
        );
    }, [activeProblem, addAssistantMessage]);

    // Type in small chunks instead of updating React for every character.
    // This reduces re-renders and keeps scrolling responsive.
    useEffect(() => {
        if (!typingMessageId) return;

        const message = messages.find((item) => item.id === typingMessageId);
        if (!message) return;

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
                now - lastTypingSoundRef.current >= 100
            ) {
                lastTypingSoundRef.current = now;
                playCoachSound("typing", audioContextRef, 0.12);
            }

            if (index >= message.text.length) {
                window.clearInterval(interval);
                setTypingMessageId(null);
            }
        }, 25);

        return () => window.clearInterval(interval);
    }, [typingMessageId]);

    useEffect(() => {
        const container = chatScrollRef.current;
        if (!container || !isNearBottomRef.current) return;
        // Do not use smooth scrolling on every typing update.
        container.scrollTop = container.scrollHeight;
    }, [messages, showPlan, isRequesting]);

    const requestCoachAnswer = useCallback(
        async (action) => {
            if (!activeProblem) {
                addAssistantMessage(
                    "Generate a DSA problem first, and then I can help with it."
                );
                return;
            }

            if (requestInFlightRef.current) return;

            if (!isLoggedIn) {
                addAssistantMessage("Please sign in to use the AI DSA Coach.");
                return;
            }

            const endpoints = {
                hint: "hint",
                approach: "explain-approach",
                solution: "show-solution",
            };

            const endpoint = endpoints[action];

            if (!endpoint) {
                addAssistantMessage("Sorry, that coach action is not supported.");
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

                const response = await axios.post(
                    `${import.meta.env.VITE_API_URL}/api/${endpoint}`,
                    { problem: activeProblem, code, language },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                const answer = response.data?.answer;

                if (typeof answer !== "string" || !answer.trim()) {
                    throw new Error("The AI returned an empty response. Please try again.");
                }

                setExpression("happy");
                addAssistantMessage(answer.trim());
            } catch (error) {
                console.error(`DSA Coach ${action} request failed:`, error);

                const message =
                    error.response?.data?.error ||
                    error.message ||
                    "Unable to contact the AI coach. Please try again.";

                addAssistantMessage(`I couldn't complete that request. ${message}`);
            } finally {
                requestInFlightRef.current = false;
                setIsRequesting(false);
            }
        },
        [activeProblem, code, language, isLoggedIn, getToken, sound, addAssistantMessage]
    );

    const sendUserMessage = useCallback(
        (text) => {
            const trimmed = text.trim();

            if (!trimmed || typingMessageId || isRequesting) return;

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

            if (
                normalized.includes("my plan") ||
                normalized.includes("preparation plan") ||
                normalized.includes("study plan")
            ) {
                setShowPlan(true);
                return;
            }

            if (
                normalized.includes("personalize") ||
                normalized.includes("personalise")
            ) {
                setExpression("thinking");
                sound("thinking");

                addAssistantMessage(
                    "Tell me how many minutes you can study daily and which topics feel weakest. I'll use your answers to suggest a more suitable schedule."
                );
            } else if (
                normalized.includes("explain approach") ||
                normalized.includes("explain my approach") ||
                normalized.includes("review my approach")
            ) {
                void requestCoachAnswer("approach");
            } else if (
                normalized.includes("hint") ||
                normalized.includes("stuck")
            ) {
                void requestCoachAnswer("hint");
            } else if (
                normalized.includes("show solution") ||
                normalized.includes("solution")
            ) {
                void requestCoachAnswer("solution");
            } else if (
                normalized.includes("confused") ||
                normalized.includes("don't understand")
            ) {
                setExpression("confused");
                sound("confused");

                addAssistantMessage(
                    "No worries. Let's break the problem into smaller steps. Which part is confusing you?"
                );
            } else if (
                normalized.includes("correct") ||
                normalized.includes("solved") ||
                normalized.includes("thank")
            ) {
                setExpression("celebrating");
                sound("celebrating");

                addAssistantMessage(
                    "Nice effort! A proper correctness check needs to run your code against test cases."
                );
            } else {
                setExpression("happy");

                addAssistantMessage(
                    "I can currently give you a hint, explain the approach, or show a solution for your active DSA problem. Try one of those actions."
                );
            }
        },
        [
            typingMessageId,
            isRequesting,
            sound,
            addAssistantMessage,
            requestCoachAnswer,
        ]
    );

    const handleStart = () => {
        if (typingMessageId || isRequesting) return;

        setShowPlan(false);
        setShowGiveUpOptions(false);
        sound("send");

        setMessages((current) => [
            ...current,
            {
                id: createId(),
                role: "user",
                text: "Let's Start",
                visibleText: "Let's Start",
            },
        ]);

        addAssistantMessage(
            "Let's get started! Which companies are you targeting, and which DSA topics have you covered? You can tell me your daily study time too. Your question-specific actions will appear when the DSA Arena supplies an active problem."
        );
    };

    const handleMyPlan = () => {
        if (typingMessageId || isRequesting) return;

        sound("send");
        setShowPlan(true);

        setMessages((current) => [
            ...current,
            {
                id: createId(),
                role: "user",
                text: "My Plan",
                visibleText: "My Plan",
            },
        ]);
    };

    const handleHint = () => {
        setShowGiveUpOptions(false);
        sendUserMessage("Give me a hint");
    };

    const handleGiveUp = () => {
        if (typingMessageId || isRequesting) return;

        sound("thinking");
        setShowGiveUpOptions(true);
        setExpression("thinking");

        addAssistantMessage("That's okay. How would you like to proceed?");
    };

    const handleExplainApproach = () => {
        setShowGiveUpOptions(false);
        sendUserMessage("Explain approach");
    };

    const handleShowSolution = () => {
        setShowGiveUpOptions(false);
        sendUserMessage("Show solution");
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

        setPosition(
            clampPosition(
                drag.startX + event.clientX - drag.pointerX,
                drag.startY + event.clientY - drag.pointerY
            )
        );
    };

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label="Open PrepAI DSA Coach"
                title="Open PrepAI Coach"
                className="fixed bottom-5 right-5 z-[80] h-14 w-14 rounded-full border border-text-secondary/30 bg-surface p-1 shadow-xl transition hover:scale-105"
            >
                <PrepAIRobot speaking={isTyping} expression={expression} />
                <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-500" />
            </button>
        );
    }

    return (
        <div
            className="fixed z-[80]"
            style={{
                left: position.x,
                top: position.y,
                width: `min(${panelSize.width}px, calc(100vw - 24px))`,
            }}
        >
            <div className="pointer-events-none absolute -left-[58px] top-0 hidden h-[54px] w-[54px] sm:block">
                <PrepAIRobot speaking={isTyping} expression={expression} />
            </div>

            <section
                ref={panelRef}
                aria-label="PrepAI DSA Coach"
                style={{
                    height: `min(${panelSize.height}px, calc(100vh - 24px))`,
                    maxWidth: "100%",
                }}
                className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-text-secondary/25 bg-surface text-text-primary shadow-xl"
            >
                <header
                    onPointerDown={startDragging}
                    onPointerMove={dragPanel}
                    onPointerUp={() => {
                        dragRef.current = null;
                    }}
                    onPointerCancel={() => {
                        dragRef.current = null;
                    }}
                    className="flex shrink-0 touch-none cursor-grab items-center gap-2 border-b border-text-secondary/20 px-3 py-2 active:cursor-grabbing"
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-semibold">PrepAI Coach</h2>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                DSA mentor
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setIsOpen(false)}
                        aria-label="Minimize coach"
                        className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-text-secondary/10"
                    >
                        <Minus size={17} />
                    </button>
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
                                PrepAI is thinking...
                            </div>
                        )}

                        {showPlan && (
                            <div className="rounded-xl bg-text-secondary/[0.06] p-3 text-sm">
                                <PlanCard />
                                <button
                                    type="button"
                                    onClick={() => sendUserMessage("Help me personalize my plan")}
                                    disabled={isTyping || isRequesting}
                                    className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                                >
                                    Personalize my plan
                                </button>
                            </div>
                        )}
                    </div>

                    {!isTyping && !isRequesting && (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-text-secondary/15 px-2.5 py-2">
                            {!hasActiveProblem ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleStart}
                                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
                                    >
                                        <Sparkles size={14} />
                                        Let's Start
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleMyPlan}
                                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-text-secondary/20 px-3 py-2 text-xs font-medium transition hover:bg-text-secondary/10"
                                    >
                                        <CalendarDays size={14} />
                                        My Plan
                                    </button>
                                </>
                            ) : showGiveUpOptions ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleExplainApproach}
                                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-text-secondary/20 px-3 py-2 text-xs font-medium transition hover:bg-text-secondary/10"
                                    >
                                        <Lightbulb size={14} />
                                        Explain Approach
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleShowSolution}
                                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                                    >
                                        <Sparkles size={14} />
                                        Show Solution
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleHint}
                                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-600 transition hover:bg-amber-500/10"
                                    >
                                        <Lightbulb size={14} />
                                        Hint
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleGiveUp}
                                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-text-secondary/20 px-3 py-2 text-xs font-medium transition hover:bg-text-secondary/10"
                                    >
                                        Give Up
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            sendUserMessage(input);
                        }}
                        className="flex shrink-0 items-center gap-2 border-t border-text-secondary/20 p-2"
                    >
                        <input
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            disabled={isTyping || isRequesting}
                            placeholder="Ask your DSA coach..."
                            aria-label="Message PrepAI Coach"
                            className="min-w-0 flex-1 rounded-lg border border-text-secondary/25 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-emerald-500 disabled:opacity-60"
                        />

                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping || isRequesting}
                            aria-label="Send message"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Send size={15} />
                        </button>

                        <button
                            type="button"
                            onClick={() => setSoundEnabled((enabled) => !enabled)}
                            aria-label={soundEnabled ? "Mute coach sounds" : "Enable coach sounds"}
                            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-text-secondary/20 text-text-secondary hover:bg-text-secondary/10"
                        >
                            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                        </button>
                    </form>
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
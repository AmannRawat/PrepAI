import React from 'react';

/**
 * PepeAvatar Component
 * Direct SVG character representation of Pepe, the PrepAI AI Coach.
 *
 * Updates:
 * - Direct face display without circular container/outline.
 * - Tightened viewBox so the face is slightly larger, prominent, and clearly visible.
 * - States:
 *   - isThinking: Amber pulsing antenna bulb, thoughtful eyes
 *   - isSpeaking: Animated speech mouth
 *   - isCelebrating: Joyful celebratory eyes & smile
 *   - idle: Gentle floating & blinking
 * - Full prefers-reduced-motion accessibility support.
 */
export default function PepeAvatar({
    isSpeaking = false,
    isThinking = false,
    isCelebrating = false,
    size = 'md',
    className = '',
}) {
    // Proportional sizing tokens for direct face rendering
    const sizeClasses = {
        sm: 'w-9 h-8 min-w-[36px]',
        md: 'w-11 h-10 min-w-[44px]',
        lg: 'w-14 h-13 min-w-[56px]',
        xl: 'w-20 h-18 min-w-[80px]',
    };

    const containerSize = sizeClasses[size] || sizeClasses.md;

    return (
        <div
            className={`relative flex items-center justify-center shrink-0 transition-transform select-none ${containerSize} ${className}`}
            role="img"
            aria-label={
                isSpeaking
                    ? "Pepe is speaking"
                    : isThinking
                    ? "Pepe is thinking"
                    : isCelebrating
                    ? "Pepe is celebrating"
                    : "Pepe AI Coach avatar"
            }
        >
            <svg
                viewBox="14 1 132 120"
                className="w-full h-full drop-shadow-sm overflow-visible"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="pepeAvatarBodyGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="50%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="pepeAvatarFaceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1e293b" />
                        <stop offset="100%" stopColor="#0f172a" />
                    </linearGradient>
                    <linearGradient id="pepeAvatarEyeGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <filter id="pepeAvatarGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                <style>{`
                    @keyframes pepeAvatarIdleFloat {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-2px); }
                    }
                    @keyframes pepeAvatarBlink {
                        0%, 92%, 100% { transform: scaleY(1); }
                        95% { transform: scaleY(0.08); }
                    }
                    @keyframes pepeAvatarAntennaPulse {
                        0%, 100% { fill: #38bdf8; filter: drop-shadow(0 0 2px #38bdf8); }
                        50% { fill: #fbbf24; filter: drop-shadow(0 0 6px #f59e0b); }
                    }
                    @keyframes pepeAvatarMouthTalk {
                        0%, 100% { height: 4px; y: 84px; }
                        50% { height: 11px; y: 80px; rx: 5px; }
                    }
                    .pepe-av-float {
                        animation: pepeAvatarIdleFloat 3s ease-in-out infinite;
                        transform-origin: center;
                    }
                    .pepe-av-eyelid {
                        transform-origin: 80px 63px;
                        animation: pepeAvatarBlink 4.2s ease-in-out infinite;
                    }
                    .pepe-av-antenna-thinking {
                        animation: pepeAvatarAntennaPulse 0.8s ease-in-out infinite;
                    }
                    .pepe-av-mouth-speaking {
                        animation: pepeAvatarMouthTalk 0.28s ease-in-out infinite;
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .pepe-av-float,
                        .pepe-av-eyelid,
                        .pepe-av-antenna-thinking,
                        .pepe-av-mouth-speaking {
                            animation: none !important;
                        }
                    }
                `}</style>

                <g className="pepe-av-float">
                    {/* Antenna */}
                    <path d="M80 24 V13" stroke="#93c5fd" strokeWidth="4.5" strokeLinecap="round" />
                    <circle
                        cx="80"
                        cy="9"
                        r="6.5"
                        fill={isThinking ? "#fbbf24" : "#38bdf8"}
                        className={isThinking ? "pepe-av-antenna-thinking" : ""}
                        filter="url(#pepeAvatarGlow)"
                    />

                    {/* Cute Ear Headphones */}
                    <rect x="16" y="58" width="13" height="32" rx="6.5" fill="#3b82f6" />
                    <rect x="18" y="63" width="6" height="22" rx="3" fill="#93c5fd" />
                    <rect x="131" y="58" width="13" height="32" rx="6.5" fill="#3b82f6" />
                    <rect x="136" y="63" width="6" height="22" rx="3" fill="#93c5fd" />

                    {/* Outer Rounded Head */}
                    <rect x="25" y="24" width="110" height="92" rx="32" fill="url(#pepeAvatarBodyGrad)" />
                    <path d="M48 28 Q80 25 112 28" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round" fill="none" />

                    {/* Visor / Face Screen */}
                    <rect x="36" y="37" width="88" height="66" rx="22" fill="url(#pepeAvatarFaceGrad)" />
                    <rect x="36" y="37" width="88" height="66" rx="22" fill="none" stroke="#334155" strokeWidth="1.5" />

                    {/* Eyes */}
                    <g className={isThinking ? "" : "pepe-av-eyelid"}>
                        {isCelebrating ? (
                            <>
                                <path d="M51 68 Q59 55 67 68" fill="none" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" />
                                <path d="M93 68 Q101 55 109 68" fill="none" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" />
                            </>
                        ) : isThinking ? (
                            <>
                                <ellipse cx="60" cy="58" rx="8" ry="8.5" fill="url(#pepeAvatarEyeGlow)" />
                                <circle cx="62" cy="56" r="2.8" fill="#ffffff" />
                                <ellipse cx="100" cy="58" rx="8" ry="8.5" fill="url(#pepeAvatarEyeGlow)" />
                                <circle cx="102" cy="56" r="2.8" fill="#ffffff" />
                            </>
                        ) : (
                            <>
                                <ellipse cx="59" cy="63" rx="8" ry="9.5" fill="url(#pepeAvatarEyeGlow)" />
                                <circle cx="57" cy="60" r="3" fill="#ffffff" />
                                <circle cx="62" cy="65" r="1.5" fill="#ffffff" opacity="0.8" />

                                <ellipse cx="101" cy="63" rx="8" ry="9.5" fill="url(#pepeAvatarEyeGlow)" />
                                <circle cx="99" cy="60" r="3" fill="#ffffff" />
                                <circle cx="104" cy="65" r="1.5" fill="#ffffff" opacity="0.8" />
                            </>
                        )}
                    </g>

                    {/* Cheeks */}
                    <ellipse cx="49" cy="74" rx="4.5" ry="2.5" fill="#f472b6" opacity="0.45" />
                    <ellipse cx="111" cy="74" rx="4.5" ry="2.5" fill="#f472b6" opacity="0.45" />

                    {/* Mouth */}
                    {isSpeaking ? (
                        <rect
                            x="71"
                            y="81"
                            width="18"
                            height="8"
                            rx="4"
                            fill="#38bdf8"
                            className="pepe-av-mouth-speaking"
                        />
                    ) : isThinking ? (
                        <path
                            d="M72 84 Q80 87 88 84"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                        />
                    ) : isCelebrating ? (
                        <path
                            d="M68 81 Q80 93 92 81"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                    ) : (
                        <path
                            d="M72 84 Q80 90 88 84"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                        />
                    )}
                </g>
            </svg>
        </div>
    );
}

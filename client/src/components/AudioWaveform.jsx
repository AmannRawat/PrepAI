import { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

/**
 * AudioWaveform Component
 *
 * Real-time audio waveform visualizer driven by Web Audio API AnalyserNode.
 * Renders left (cyan) and right (teal/emerald) frequency bars flanking the circular microphone control.
 *
 * Settle behavior:
 * When silent or paused, the bars settle smoothly to a calm, flat horizontal line (3-4px height).
 * When candidate speaks, bars dynamically expand proportionally to real microphone frequency/amplitude.
 *
 * Respects `prefers-reduced-motion`.
 */
export default function AudioWaveform({
  analyserNode,
  isRecording = false,
  timerText = '00:00',
  statusText = 'Listening...',
  onMicClick,
}) {
  const leftCanvasRef = useRef(null);
  const rightCanvasRef = useRef(null);
  const animFrameIdRef = useRef(null);

  useEffect(() => {
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;
    if (!leftCanvas || !rightCanvas) return;

    const leftCtx = leftCanvas.getContext('2d');
    const rightCtx = rightCanvas.getContext('2d');
    if (!leftCtx || !rightCtx) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const BAR_COUNT = 16;
    const BAR_WIDTH = 3.5;
    const GAP = 5.5;
    const MIN_HEIGHT = 3.5;
    const MAX_HEIGHT = 36;

    // Frequency buffer
    let dataArray = null;
    if (analyserNode) {
      dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    }

    const draw = () => {
      const width = leftCanvas.width;
      const height = leftCanvas.height;
      const centerY = height / 2;

      // Clear both canvases
      leftCtx.clearRect(0, 0, width, height);
      rightCtx.clearRect(0, 0, width, height);

      // Create Left Gradient (Emerald -> Teal -> Cyan)
      const leftGrad = leftCtx.createLinearGradient(0, 0, width, 0);
      leftGrad.addColorStop(0, '#10b981'); // emerald-500
      leftGrad.addColorStop(0.5, '#14b8a6'); // teal-500
      leftGrad.addColorStop(1, '#06b6d4'); // cyan-500

      // Create Right Gradient (Cyan -> Teal -> Emerald)
      const rightGrad = rightCtx.createLinearGradient(0, 0, width, 0);
      rightGrad.addColorStop(0, '#06b6d4'); // cyan-500
      rightGrad.addColorStop(0.5, '#14b8a6'); // teal-500
      rightGrad.addColorStop(1, '#10b981'); // emerald-500

      leftCtx.fillStyle = leftGrad;
      rightCtx.fillStyle = rightGrad;

      let leftValues = new Array(BAR_COUNT).fill(0);
      let rightValues = new Array(BAR_COUNT).fill(0);

      if (isRecording && analyserNode && dataArray && !prefersReducedMotion) {
        analyserNode.getByteFrequencyData(dataArray);

        // Audio noise gate to eliminate ambient mic hiss and settle to flat line
        let sum = 0;
        for (let i = 0; i < 32; i++) {
          sum += dataArray[i];
        }
        const avg = sum / 32;

        if (avg > 10) {
          // Map frequency bins: low/mid to left bars (reversed so peak is near mic)
          for (let i = 0; i < BAR_COUNT; i++) {
            const raw = dataArray[i + 2] || 0;
            leftValues[i] = Math.max(0, (raw - 8) / 247);
          }
          // Mid/high to right bars
          for (let i = 0; i < BAR_COUNT; i++) {
            const raw = dataArray[i + 14] || 0;
            rightValues[i] = Math.max(0, (raw - 8) / 247);
          }
        }
      }

      // Draw Left Bars (from outer edge moving inward toward center mic)
      for (let i = 0; i < BAR_COUNT; i++) {
        const val = leftValues[i];
        const barH = MIN_HEIGHT + val * (MAX_HEIGHT - MIN_HEIGHT);
        const x = i * (BAR_WIDTH + GAP);
        const y = centerY - barH / 2;

        leftCtx.beginPath();
        leftCtx.roundRect(x, y, BAR_WIDTH, barH, 2);
        leftCtx.fill();
      }

      // Draw Right Bars (from center mic moving outward toward right edge)
      for (let i = 0; i < BAR_COUNT; i++) {
        const val = rightValues[i];
        const barH = MIN_HEIGHT + val * (MAX_HEIGHT - MIN_HEIGHT);
        const x = i * (BAR_WIDTH + GAP);
        const y = centerY - barH / 2;

        rightCtx.beginPath();
        rightCtx.roundRect(x, y, BAR_WIDTH, barH, 2);
        rightCtx.fill();
      }

      if (isRecording) {
        animFrameIdRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [analyserNode, isRecording]);

  return (
    <div className="flex flex-col items-center justify-center select-none py-1">
      {/* Symmetrical Waveform & Mic Control */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 w-full max-w-md mx-auto">
        {/* Left Waveform (Teal/Emerald) */}
        <canvas
          ref={leftCanvasRef}
          width={145}
          height={44}
          className="h-10 w-28 sm:w-36 pointer-events-none"
        />

        {/* Center Glowing Circular Microphone Button */}
        <button
          type="button"
          onClick={onMicClick}
          className="relative group w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 shadow-[0_0_28px_rgba(20,184,166,0.45)] hover:shadow-[0_0_36px_rgba(20,184,166,0.65)] flex items-center justify-center text-white transition-all transform hover:scale-105 active:scale-95 shrink-0 focus:outline-none"
          title={isRecording ? 'Click to pause / finish' : 'Click to record'}
          aria-label={isRecording ? 'Stop voice recording' : 'Start voice recording'}
        >
          {isRecording && (
            <span className="absolute inset-0 rounded-full border-2 border-teal-400/60 animate-ping pointer-events-none opacity-75" />
          )}
          {isRecording ? (
            <Mic className="w-6 h-6 text-white drop-shadow" />
          ) : (
            <MicOff className="w-6 h-6 text-white/80" />
          )}
        </button>

        {/* Right Waveform (Teal/Emerald) */}
        <canvas
          ref={rightCanvasRef}
          width={145}
          height={44}
          className="h-10 w-28 sm:w-36 pointer-events-none"
        />
      </div>

      {/* Recording Timer and Status */}
      <div className="flex flex-col items-center mt-2">
        <span className="font-mono text-xs font-bold text-teal-400 tracking-wider">
          {timerText}
        </span>
        <span className="text-[11px] text-text-secondary/90 font-medium mt-0.5">
          {statusText}
        </span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { saveLibraryProgress } from "@/lib/actions/library";

const RATES = [0.8, 1, 1.25, 1.5, 1.75, 2];

const fmtTime = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

/**
 * Audiobook player: native <audio> controls plus 30 s skip buttons and speed.
 * Your position is saved every 20 s while playing (and on pause) — pick the
 * book up on any device and it resumes where you stopped.
 */
export function AudiobookPlayer({
  bookId,
  src,
  initialSeconds,
}: {
  bookId: string;
  src: string;
  initialSeconds: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [restored, setRestored] = useState(false);
  const lastSaved = useRef(0);

  const save = (force = false) => {
    const el = audioRef.current;
    if (!el || !isFinite(el.duration) || el.duration === 0) return;
    const t = el.currentTime;
    if (!force && Math.abs(t - lastSaved.current) < 5) return;
    lastSaved.current = t;
    void saveLibraryProgress(bookId, String(Math.floor(t)), (t / el.duration) * 100);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const el = audioRef.current;
      if (el && !el.paused) save();
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
    save(true);
  };

  return (
    <div className="space-y-3">
      <audio
        ref={audioRef}
        src={src}
        controls
        preload="metadata"
        className="w-full"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (!restored && initialSeconds > 0 && initialSeconds < (el.duration || Infinity)) {
            el.currentTime = initialSeconds;
          }
          setRestored(true);
        }}
        onPause={() => save(true)}
        onEnded={() => save(true)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => skip(-30)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
        >
          ⏪ 30 s
        </button>
        <button
          onClick={() => skip(30)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
        >
          30 s ⏩
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-sm text-stone-500">
          Speed
          <select
            value={rate}
            onChange={(e) => {
              const r = parseFloat(e.target.value);
              setRate(r);
              if (audioRef.current) audioRef.current.playbackRate = r;
            }}
            className="rounded-lg border border-stone-300 px-2 py-1 text-sm"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </div>
      </div>
      {initialSeconds > 0 && (
        <p className="text-xs text-stone-400">
          Resumed from {fmtTime(initialSeconds)} — your spot is saved as you listen.
        </p>
      )}
    </div>
  );
}

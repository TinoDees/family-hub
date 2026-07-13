"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * DocScannerModal — in-app document scanner (Tino, 28 Jun 2026).
 *
 * Camera capture → an editable 4-corner crop (auto edge-detect pre-fills the
 * corners via OpenCV + jscanify, lazy-loaded from CDN; you can drag them) →
 * perspective-warp to a flat document on "Use" → B&W "scan look" enhance →
 * JPEG File via onCapture. Degrades gracefully: no camera / no CV / no detection
 * all fall back sensibly (full-frame corners + a bounding-box crop), so the
 * scanner always produces something. Works on Android + iOS over HTTPS.
 */

import { useEffect, useRef, useState, useCallback } from "react";

type Pt = { x: number; y: number };

const SCAN_FILTER = "grayscale(1) contrast(1.6) brightness(1.08)";
const OPENCV_URL = "https://docs.opencv.org/4.7.0/opencv.js";
const JSCANIFY_URL = "https://cdn.jsdelivr.net/gh/ColonelParrot/jscanify@master/src/jscanify.min.js";
const DEFAULT_CORNERS: Pt[] = [{ x: 0.07, y: 0.07 }, { x: 0.93, y: 0.07 }, { x: 0.93, y: 0.93 }, { x: 0.07, y: 0.93 }];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`) as (HTMLScriptElement & { _loaded?: boolean }) | null;
    if (existing) {
      if (existing._loaded) resolve();
      else { existing.addEventListener("load", () => resolve()); existing.addEventListener("error", () => reject(new Error("load failed"))); }
      return;
    }
    const sc = document.createElement("script") as HTMLScriptElement & { _loaded?: boolean };
    sc.src = src; sc.async = true; sc.dataset.src = src;
    sc.addEventListener("load", () => { sc._loaded = true; resolve(); });
    sc.addEventListener("error", () => reject(new Error("load failed: " + src)));
    document.head.appendChild(sc);
  });
}

let scannerPromise: Promise<any | null> | null = null;
function ensureScanner(): Promise<any | null> {
  if (scannerPromise) return scannerPromise;
  scannerPromise = (async () => {
    try {
      const w = window as any;
      await loadScript(OPENCV_URL);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("opencv init timeout")), 30000);
        const ok = () => { clearTimeout(timer); resolve(); };
        if (w.cv && w.cv.Mat) return ok();
        if (w.cv && typeof w.cv.then === "function") { w.cv.then(() => ok()).catch(() => reject(new Error("cv"))); return; }
        if (w.cv) w.cv.onRuntimeInitialized = ok;
        const iv = setInterval(() => { if (w.cv && w.cv.Mat) { clearInterval(iv); ok(); } }, 150);
      });
      await loadScript(JSCANIFY_URL);
      if (typeof w.jscanify !== "function") return null;
      return new w.jscanify();
    } catch {
      scannerPromise = null;
      return null;
    }
  })();
  return scannerPromise;
}

/** Auto-detect the paper corners as fractions (0..1) of the canvas. Null if not
 *  found confidently or anything fails — caller falls back to defaults. */
function detectCornerFractions(src: HTMLCanvasElement, scanner: any): Pt[] | null {
  const cv = (window as any).cv;
  if (!scanner || !cv || !cv.imread) return null;
  let mat: any = null;
  try {
    mat = cv.imread(src);
    const contour = scanner.findPaperContour(mat);
    if (!contour) return null;
    const c = scanner.getCornerPoints(contour);
    if (!c || !c.topLeftCorner || !c.topRightCorner || !c.bottomLeftCorner || !c.bottomRightCorner) return null;
    const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
    const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
    const wpx = Math.max(d(c.topLeftCorner, c.topRightCorner), d(c.bottomLeftCorner, c.bottomRightCorner));
    const hpx = Math.max(d(c.topLeftCorner, c.bottomLeftCorner), d(c.topRightCorner, c.bottomRightCorner));
    if (wpx < src.width * 0.2 || hpx < src.height * 0.2) return null;
    return pts.map((p: any) => ({ x: Math.min(1, Math.max(0, p.x / src.width)), y: Math.min(1, Math.max(0, p.y / src.height)) }));
  } catch {
    return null;
  } finally {
    if (mat && mat.delete) { try { mat.delete(); } catch { /* noop */ } }
  }
}

/** Perspective-warp the source canvas to a flat rectangle from 4 px corners
 *  (TL, TR, BR, BL). Falls back to a bounding-box crop without OpenCV. */
function cropFromCorners(src: HTMLCanvasElement, pts: Pt[]): HTMLCanvasElement {
  const cv = (window as any).cv;
  const [tl, tr, br, bl] = pts;
  const w = Math.max(8, Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y))));
  const h = Math.max(8, Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y))));
  if (cv && cv.imread && cv.getPerspectiveTransform) {
    let s: any, srcTri: any, dstTri: any, M: any, dst: any;
    try {
      s = cv.imread(src);
      srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
      M = cv.getPerspectiveTransform(srcTri, dstTri);
      dst = new cv.Mat();
      cv.warpPerspective(s, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
      const out = document.createElement("canvas"); out.width = w; out.height = h;
      cv.imshow(out, dst);
      return out;
    } catch {
      /* fall through to bbox */
    } finally {
      [s, srcTri, dstTri, M, dst].forEach(m => { if (m && m.delete) { try { m.delete(); } catch { /* noop */ } } });
    }
  }
  // bounding-box fallback (no perspective)
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(src.width, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(src.height, Math.ceil(Math.max(...ys)));
  const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY);
  const out = document.createElement("canvas"); out.width = cw; out.height = ch;
  out.getContext("2d")?.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

export default function DocScannerModal({ onCapture, onClose }: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any | null>(null);
  const shotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [corners, setCorners] = useState<Pt[] | null>(null);
  const [enhance, setEnhance] = useState(true);
  const [cvState, setCvState] = useState<"loading" | "ready" | "off">("loading");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
    } catch {
      setError("Could not open the camera. Allow camera access for this site in your browser settings, or use the Photo / File buttons instead.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    ensureScanner().then(s => { scannerRef.current = s; setCvState(s ? "ready" : "off"); });
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Android / browser back button → close the scanner instead of navigating away.
  useEffect(() => {
    window.history.pushState({ traceyModal: "scanner" }, "");
    let poppedByBack = false;
    const onPop = () => { poppedByBack = true; stopCamera(); onClose(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!poppedByBack) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    stopCamera();
    shotCanvasRef.current = c;
    setCorners(detectCornerFractions(c, scannerRef.current) ?? DEFAULT_CORNERS);
    setShot(c.toDataURL("image/jpeg", 0.92));
  }

  function retake() { setShot(null); setCorners(null); shotCanvasRef.current = null; startCamera(); }
  function resetAuto() {
    const c = shotCanvasRef.current; if (!c) return;
    setCorners(detectCornerFractions(c, scannerRef.current) ?? DEFAULT_CORNERS);
  }

  function moveCorner(idx: number, clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setCorners(cs => (cs ? cs.map((c, i) => (i === idx ? { x, y } : c)) : cs));
  }

  async function use() {
    const src = shotCanvasRef.current;
    if (!src || !corners) return;
    setBusy(true);
    const px = corners.map(c => ({ x: c.x * src.width, y: c.y * src.height }));
    let cropped: HTMLCanvasElement;
    try { cropped = cropFromCorners(src, px); } catch { cropped = src; }
    const out = document.createElement("canvas");
    out.width = cropped.width; out.height = cropped.height;
    const ctx = out.getContext("2d");
    if (ctx) { if (enhance) ctx.filter = SCAN_FILTER; ctx.drawImage(cropped, 0, 0); }
    out.toBlob(blob => {
      setBusy(false);
      if (blob) onCapture(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    }, "image/jpeg", 0.9);
  }

  const btn = (bg: string): React.CSSProperties => ({ fontSize: "0.9rem", fontWeight: 700, color: "#fff", background: bg, border: 0, borderRadius: "0.5rem", padding: "0.6rem 1rem", cursor: "pointer" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", color: "#fff", gap: "0.5rem" }}>
        <strong style={{ whiteSpace: "nowrap" }}>📑 Scan document</strong>
        <span style={{ fontSize: "0.72rem", color: "#cbd5e1" }}>
          {cvState === "loading" ? "preparing auto-crop…" : cvState === "ready" ? "drag corners to adjust" : "manual crop (auto unavailable)"}
        </span>
        <button type="button" onClick={() => { stopCamera(); onClose(); }} aria-label="Close" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: 0, borderRadius: "0.5rem", padding: "0.35rem 0.7rem", fontSize: "1.05rem", cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", padding: "0.5rem" }}>
        {error ? (
          <div style={{ color: "#fff", padding: "1.5rem", textAlign: "center", fontSize: "0.9rem", lineHeight: 1.5 }}>{error}</div>
        ) : shot ? (
          <div ref={frameRef} style={{ position: "relative", display: "inline-block", lineHeight: 0, touchAction: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot} alt="Captured document" style={{ display: "block", maxWidth: "94vw", maxHeight: "66vh", filter: enhance ? SCAN_FILTER : "none" }} />
            {corners && (
              <>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  <polygon points={corners.map(c => `${c.x * 100},${c.y * 100}`).join(" ")} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                </svg>
                {corners.map((c, idx) => (
                  <div
                    key={idx}
                    onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag(idx); }}
                    onPointerMove={e => { if (drag === idx) moveCorner(idx, e.clientX, e.clientY); }}
                    onPointerUp={e => { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); setDrag(null); }}
                    style={{ position: "absolute", left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: "9999px", background: "rgba(37,99,235,0.35)", border: "2px solid #fff", boxShadow: "0 0 0 1px #2563eb", touchAction: "none", cursor: "grab" }}
                  />
                ))}
              </>
            )}
          </div>
        ) : (
          <video ref={videoRef} playsInline muted style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        )}
      </div>

      <div style={{ padding: "1rem", display: "flex", gap: "0.6rem", alignItems: "center", justifyContent: "center", flexWrap: "wrap", background: "#111" }}>
        {error ? (
          <button type="button" onClick={() => { stopCamera(); onClose(); }} style={btn("#374151")}>Close</button>
        ) : !shot ? (
          <button type="button" onClick={capture} style={{ ...btn("#dc2626"), padding: "0.7rem 1.6rem" }}>● Capture</button>
        ) : (
          <>
            <label style={{ color: "#fff", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
              <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} /> B&amp;W
            </label>
            <button type="button" onClick={resetAuto} style={btn("#374151")}>Auto corners</button>
            <button type="button" onClick={retake} style={btn("#374151")}>Retake</button>
            <button type="button" onClick={use} disabled={busy} style={btn("#166534")}>{busy ? "Saving…" : "Use this"}</button>
          </>
        )}
      </div>
    </div>
  );
}

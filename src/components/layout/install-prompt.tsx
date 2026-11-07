"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Chromium-only event, not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
declare global {
  interface Window {
    __wasalniBip?: BeforeInstallPromptEvent | null;
  }
}

const DELAY_MS = 10_000;
const SESSION_KEY = "wasalni:install-prompt"; // "shown" | "dismissed" → once per session
const INSTALLED_KEY = "wasalni:installed";

/**
 * Inline script for <head>: `beforeinstallprompt` can fire before React hydrates,
 * so it is captured as early as possible and picked up by <InstallPrompt />.
 */
export const captureInstallPromptScript = `window.__wasalniBip=null;addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__wasalniBip=e;window.dispatchEvent(new Event("wasalni:bip"))});addEventListener("appinstalled",function(){window.__wasalniBip=null;try{localStorage.setItem("${INSTALLED_KEY}","1")}catch(_){}});`;

function safeGet(store: () => Storage, key: string) {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}
function safeSet(store: () => Storage, key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch {}
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as "Macintosh" but has touch.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

type View = "invite" | "ios";

export function InstallPrompt() {
  const [view, setView] = useState<View | null>(null);
  const [open, setOpen] = useState(false); // drives the enter/leave transition
  const [busy, setBusy] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Register the service worker (required for installability).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);

  // Decide whether/when to show the invitation.
  useEffect(() => {
    if (isStandalone() || safeGet(() => localStorage, INSTALLED_KEY)) return;
    if (safeGet(() => sessionStorage, SESSION_KEY)) return;

    const ios = isIOS();
    let elapsed = false;
    let shown = false;

    const tryShow = () => {
      // Android/desktop: only when the browser can actually install (it never
      // fires beforeinstallprompt if the app is already installed). iOS: manual.
      if (shown || !elapsed || (!ios && !window.__wasalniBip)) return;
      if (isStandalone() || safeGet(() => localStorage, INSTALLED_KEY)) return;
      shown = true;
      safeSet(() => sessionStorage, SESSION_KEY, "shown");
      setView("invite");
    };

    // 10 s after the page was opened (performance.now() counts from navigation start).
    const timer = window.setTimeout(() => {
      elapsed = true;
      tryShow();
    }, Math.max(0, DELAY_MS - performance.now()));

    const onInstalled = () => {
      safeSet(() => localStorage, INSTALLED_KEY, "1");
      shown = true;
      setOpen(false);
    };
    window.addEventListener("wasalni:bip", tryShow);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("wasalni:bip", tryShow);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Enter animation on mount, unmount after the leave animation.
  useEffect(() => {
    if (!view) return;
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [view]);
  useEffect(() => {
    if (open) {
      primaryRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!view) return;
    const t = window.setTimeout(() => setView(null), 300);
    return () => window.clearTimeout(t);
  }, [open, view]);

  const dismiss = useCallback(() => {
    safeSet(() => sessionStorage, SESSION_KEY, "dismissed");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  async function install() {
    const evt = window.__wasalniBip;
    if (!evt) {
      if (isIOS()) setView("ios");
      else dismiss();
      return;
    }
    setBusy(true);
    try {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      if (outcome === "accepted") safeSet(() => localStorage, INSTALLED_KEY, "1");
    } catch {
      // prompt() can only be called once per event.
    } finally {
      window.__wasalniBip = null;
      setBusy(false);
      dismiss();
    }
  }

  if (!view) return null;
  // Only rendered client-side (view is null during SSR).
  const iosOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center p-3 sm:items-center sm:p-6"
      lang="ar"
      dir="rtl"
      style={{ fontFamily: "var(--font-arabic-first)" }}
    >
      <div
        aria-hidden
        onClick={dismiss}
        className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        aria-describedby="install-desc"
        className={`relative w-full max-w-md rounded-3xl bg-white p-6 shadow-lift ring-1 ring-slate-900/5 transition-all duration-300 ease-out sm:p-7 ${
          open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="سكّر"
          className="absolute top-3 left-3 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-5" aria-hidden />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={72}
            height={72}
            className="size-[72px] rounded-[22px] shadow-lg shadow-brand-700/25 ring-1 ring-black/5"
          />

          {view === "invite" ? (
            <>
              <h2 id="install-title" className="mt-5 text-xl font-bold leading-snug text-slate-900">
                🚗 استعمل Waselni Fahs كتطبيق على تلفونك!
              </h2>
              <p id="install-desc" className="mt-2 text-[15px] leading-relaxed text-slate-600">
                حمّل التطبيق على تلفونك واستمتع بتجربة أسهل وأسرع، من غير ما تحتاج تفتح المتصفح كل مرة.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2.5">
                <Button ref={primaryRef} size="lg" className="w-full" loading={busy} onClick={install}>
                  حمّل التطبيق
                </Button>
                <Button variant="ghost" size="lg" className="w-full text-slate-500" onClick={dismiss}>
                  موش توّا
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 id="install-title" className="mt-5 text-xl font-bold leading-snug text-slate-900">
                زيد Waselni Fahs للشاشة الرئيسية
              </h2>
              <p id="install-desc" className="mt-2 text-[15px] leading-relaxed text-slate-600">
                {iosOtherBrowser
                  ? "على iPhone، التنصيب يخدم من Safari. حلّ الموقع في Safari وبعد:"
                  : "على iPhone، التنصيب يصير من Safari في 3 خطوات:"}
              </p>
              <ol className="mt-5 w-full space-y-3 text-start text-[15px] text-slate-700">
                <Step n={1}>
                  إنزل على زر المشاركة <Share className="inline size-5 align-text-bottom text-brand-600" aria-label="Share" /> لتحت
                </Step>
                <Step n={2}>
                  اختار «Add to Home Screen» <SquarePlus className="inline size-5 align-text-bottom text-brand-600" aria-hidden />
                </Step>
                <Step n={3}>إنزل على «Add» فوق، والتطبيق يظهر في تلفونك</Step>
              </ol>
              <Button ref={primaryRef} size="lg" className="mt-6 w-full" onClick={dismiss}>
                فهمت
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

"use client";

import { MonitorPlay, Power } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ExpandIcon from "@/components/ui/expand-icon";
import ExternalLinkIcon from "@/components/ui/external-link-icon";
import GithubIcon from "@/components/ui/github-icon";
import XIcon from "@/components/ui/x-icon";
import {
  NINE_LIVES_CREDITS,
  type NineLivesCredit,
  type NineLivesCreditGroup,
} from "@/lib/nine-lives/credits";

const GAME_URL =
  process.env.NEXT_PUBLIC_NINE_LIVES_URL ??
  "https://ninelives.beastyrabbit.com";
const GAME_ORIGIN = new URL(GAME_URL).origin;

type ButtonName =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "start"
  | "select";
type InputMessage = {
  type: "nine-lives:input";
  v: 1;
  button: ButtonName;
  state: "down" | "up";
};

const KEYBOARD_POINTER_IDS: Record<ButtonName, number> = {
  up: -1,
  down: -2,
  left: -3,
  right: -4,
  a: -5,
  b: -6,
  start: -7,
  select: -8,
};

function isActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

function handleKeyboardDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  name: ButtonName,
  onPress: (name: ButtonName, pointerId: number) => void,
) {
  if (!isActivationKey(event.key) || event.repeat) return;
  event.preventDefault();
  onPress(name, KEYBOARD_POINTER_IDS[name]);
}

function handleKeyboardUp(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  name: ButtonName,
  onRelease: (pointerId: number) => void,
) {
  if (!isActivationKey(event.key)) return;
  event.preventDefault();
  onRelease(KEYBOARD_POINTER_IDS[name]);
}

type PresentationMode = "inline" | "handheld" | "game";

type ControlHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onBlur: (event: ReactFocusEvent<HTMLButtonElement>) => void;
};

function getControlHandlers(
  name: ButtonName,
  onPress: (name: ButtonName, pointerId: number) => void,
  onRelease: (pointerId: number) => void,
): ControlHandlers {
  return {
    onPointerDown: (event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onPress(name, event.pointerId);
    },
    onPointerUp: (event) => {
      event.preventDefault();
      onRelease(event.pointerId);
    },
    onPointerCancel: (event) => onRelease(event.pointerId),
    onPointerLeave: (event) => onRelease(event.pointerId),
    onKeyDown: (event) => handleKeyboardDown(event, name, onPress),
    onKeyUp: (event) => handleKeyboardUp(event, name, onRelease),
    onBlur: () => onRelease(KEYBOARD_POINTER_IDS[name]),
  };
}

function getPresentationDeviceClass(mode: PresentationMode) {
  if (mode === "inline")
    return "mt-6 lg:ml-auto lg:mt-0 lg:w-[48%] lg:max-w-[780px] sm:mt-12";
  if (mode === "handheld")
    return "w-full max-w-[820px] sm:w-[min(100%,820px,calc((100dvh-8rem)*.84))] max-[900px]:landscape:w-full";
  return "w-full max-w-[min(1120px,94vw)]";
}

function getStatusLabel(ready: boolean, started: boolean) {
  if (ready) return "connected";
  if (started) return "loading";
  return "standby";
}

const KEYMAP = [
  ["Move", "↑/W · ↓/S · ←/A · →/D"],
  ["A", "Z / Space"],
  ["B", "X / Backspace"],
  ["Start", "Enter"],
  ["Select", "C"],
] as const;

function postMessageToGame(
  iframe: HTMLIFrameElement | null,
  message: InputMessage | { type: "nine-lives:release-all"; v: 1 },
) {
  iframe?.contentWindow?.postMessage(message, GAME_ORIGIN);
}

function MorrowmewMark() {
  return (
    <div
      className="flex items-center gap-2 text-[#263449]"
      role="img"
      aria-label="Morrowmew"
    >
      <svg aria-hidden="true" viewBox="0 0 42 32" className="h-7 w-9">
        <path d="M5 27 7 8l8 7 6-10 6 10 8-7 2 19H5Z" fill="currentColor" />
        <circle cx="15" cy="21" r="2" fill="#c8e9f0" />
        <circle cx="27" cy="21" r="2" fill="#c8e9f0" />
        <path
          d="M18 25c2 2 4 2 6 0"
          fill="none"
          stroke="#c8e9f0"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.24em]">
        Morrowmew
      </span>
    </div>
  );
}

function FaceButton({
  name,
  label,
  onPress,
  onRelease,
  pressed,
}: Readonly<{
  name: ButtonName;
  label: string;
  onPress: (name: ButtonName, pointerId: number) => void;
  onRelease: (pointerId: number) => void;
  pressed: boolean;
}>) {
  const controlHandlers = getControlHandlers(name, onPress, onRelease);
  return (
    <button
      type="button"
      aria-label={label}
      data-button={name}
      className={`size-13 shrink-0 touch-none select-none rounded-full border-4 border-[#6d2245] bg-gradient-to-br from-[#ff8a9b] to-[#d34972] font-mono text-xl font-black text-[#fff4f1] shadow-[inset_-5px_-7px_0_rgba(99,17,53,0.3),0_7px_0_#47223d] transition-transform active:translate-y-1 active:shadow-[inset_-3px_-4px_0_rgba(99,17,53,0.3),0_3px_0_#47223d] sm:size-12 ${pressed ? "translate-y-1 shadow-[inset_-3px_-4px_0_rgba(99,17,53,0.3),0_3px_0_#47223d]" : ""}`}
      {...controlHandlers}
    >
      {label}
    </button>
  );
}

function DPad({
  onPress,
  onRelease,
  pressed,
}: Readonly<{
  onPress: (name: ButtonName, pointerId: number) => void;
  onRelease: (pointerId: number) => void;
  pressed: ReadonlySet<ButtonName>;
}>) {
  return (
    <fieldset
      className="relative h-28 w-28 touch-none border-0 p-0 sm:h-32 sm:w-32"
      aria-label="Directional pad"
    >
      <div className="absolute left-1/2 top-0 h-full w-9 -translate-x-1/2 rounded-lg bg-[#23324b] shadow-[inset_3px_3px_0_rgba(255,255,255,0.08),inset_-4px_-5px_0_rgba(0,0,0,0.35)] sm:w-10" />
      <div className="absolute left-0 top-1/2 h-9 w-full -translate-y-1/2 rounded-lg bg-[#23324b] shadow-[inset_3px_3px_0_rgba(255,255,255,0.08),inset_-4px_-5px_0_rgba(0,0,0,0.35)] sm:h-10" />
      {(
        [
          ["up", "↑", "left-1/2 top-1 -translate-x-1/2"],
          ["left", "←", "left-1 top-1/2 -translate-y-1/2"],
          ["right", "→", "right-1 top-1/2 -translate-y-1/2"],
          ["down", "↓", "bottom-1 left-1/2 -translate-x-1/2"],
        ] as const
      ).map(([name, label, position]) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          data-button={name}
          className={`absolute ${position} z-10 flex h-9 w-9 touch-none select-none items-center justify-center rounded-md font-mono text-lg font-bold text-[#9eb0cf] transition-colors hover:text-[#d4e4ff] sm:h-10 sm:w-10 ${pressed.has(name) ? "bg-[#30415f] text-[#f4fdff]" : ""}`}
          {...getControlHandlers(name, onPress, onRelease)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function SpeakerGrille() {
  return (
    <div
      className="flex h-8 w-14 rotate-[-8deg] flex-col justify-center gap-1.5 sm:h-9 sm:w-16"
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((line) => (
        <span
          key={line}
          className="block h-1 rounded-full bg-[#34435d]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
        />
      ))}
    </div>
  );
}

function DeviceButton({
  name,
  label,
  onPress,
  onRelease,
  pressed,
}: Readonly<{
  name: ButtonName;
  label: string;
  onPress: (name: ButtonName, pointerId: number) => void;
  onRelease: (pointerId: number) => void;
  pressed: boolean;
}>) {
  const controlHandlers = getControlHandlers(name, onPress, onRelease);
  return (
    <button
      type="button"
      aria-label={label}
      data-button={name}
      className={`touch-none select-none rounded-full border border-[#4b5870] bg-[#7788a5] px-4 py-2 font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#edf6ff] shadow-[inset_0_2px_2px_rgba(255,255,255,0.2),0_3px_0_#35445c] transition-transform active:translate-y-0.5 active:shadow-[inset_0_2px_2px_rgba(255,255,255,0.2),0_1px_0_#35445c] ${pressed ? "translate-y-0.5 shadow-[inset_0_2px_2px_rgba(255,255,255,0.2),0_1px_0_#35445c]" : ""}`}
      {...controlHandlers}
    >
      {label}
    </button>
  );
}

// NOSONAR -- this client intentionally coordinates the device, iframe, and input bridge.
export function NineLivesClient() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const presentationRef = useRef<HTMLDialogElement>(null);
  const presentationCloseRef = useRef<HTMLButtonElement>(null);
  const presentationInlineOpenerRef = useRef<HTMLButtonElement>(null);
  const presentationOpenerRef = useRef<HTMLElement>(null);
  const pointerButtons = useRef(new Map<number, ButtonName>());
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [pressed, setPressed] = useState<ReadonlySet<ButtonName>>(new Set());
  const [frameError, setFrameError] = useState(false);
  const [presentationMode, setPresentationMode] =
    useState<PresentationMode>("inline");

  const releaseAll = useCallback(() => {
    pointerButtons.current.clear();
    setPressed(new Set());
    postMessageToGame(iframeRef.current, {
      type: "nine-lives:release-all",
      v: 1,
    });
  }, []);

  const startGame = useCallback(() => {
    setStarted(true);
    requestAnimationFrame(() => iframeRef.current?.focus());
  }, []);

  const closePresentation = useCallback(() => {
    setPresentationMode("inline");
    requestAnimationFrame(() => {
      if (started) iframeRef.current?.focus();
      else if (presentationOpenerRef.current?.isConnected)
        presentationOpenerRef.current.focus();
      else presentationInlineOpenerRef.current?.focus();
    });
  }, [started]);

  const openPresentation = useCallback(
    (mode: Exclude<PresentationMode, "inline">) => {
      presentationOpenerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setPresentationMode(mode);
      requestAnimationFrame(() => {
        if (started) iframeRef.current?.focus();
        else presentationCloseRef.current?.focus();
      });
    },
    [started],
  );

  useEffect(() => {
    if (presentationMode === "inline") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePresentation();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && presentationRef.current?.contains(target))
        return;
      requestAnimationFrame(() => {
        if (started) iframeRef.current?.focus();
        else presentationCloseRef.current?.focus();
      });
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [closePresentation, presentationMode, started]);

  const press = useCallback(
    (name: ButtonName, pointerId: number) => {
      if (!started) {
        if (name === "start") startGame();
        return;
      }
      const alreadyHeld = [...pointerButtons.current.values()].includes(name);
      pointerButtons.current.set(pointerId, name);
      setPressed((current) => new Set(current).add(name));
      if (!alreadyHeld)
        postMessageToGame(iframeRef.current, {
          type: "nine-lives:input",
          v: 1,
          button: name,
          state: "down",
        });
    },
    [startGame, started],
  );

  const release = useCallback((pointerId: number) => {
    const name = pointerButtons.current.get(pointerId);
    if (!name) return;
    const hasOtherHolder = [...pointerButtons.current].some(
      ([otherPointerId, otherName]) =>
        otherPointerId !== pointerId && otherName === name,
    );
    pointerButtons.current.delete(pointerId);
    setPressed((current) => {
      const next = new Set(current);
      if (![...pointerButtons.current.values()].includes(name))
        next.delete(name);
      return next;
    });
    if (!hasOtherHolder)
      postMessageToGame(iframeRef.current, {
        type: "nine-lives:input",
        v: 1,
        button: name,
        state: "up",
      });
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === GAME_ORIGIN &&
        event.source === iframeRef.current?.contentWindow &&
        event.data?.type === "nine-lives:ready" &&
        event.data?.v === 1
      ) {
        setReady(true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      releaseAll();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [releaseAll]);

  const creditsByGroup = useMemo(() => {
    const groups = new Map<NineLivesCreditGroup, NineLivesCredit[]>();
    for (const credit of NINE_LIVES_CREDITS) {
      const group = groups.get(credit.group) ?? [];
      group.push(credit);
      groups.set(credit.group, group);
    }
    return groups;
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-3 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <dialog
        open
        ref={presentationRef}
        aria-modal={presentationMode === "inline" ? undefined : true}
        aria-label={
          presentationMode === "inline" ? undefined : "Nine Lives player"
        }
        className={`m-0 w-full max-w-none border border-[#89d8e0]/30 bg-[#101d36] shadow-[0_32px_90px_rgba(29,126,151,0.2)] ${
          presentationMode === "inline"
            ? "relative overflow-hidden rounded-[2.5rem] px-4 py-5 sm:px-10 sm:py-12"
            : "fixed inset-0 z-[100] flex min-h-dvh max-w-none flex-col items-center justify-[safe_center] overflow-y-auto rounded-none px-3 py-16 sm:px-8 sm:py-14"
        }`}
      >
        <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full bg-[#f3a263]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#5dc6d0]/15 blur-3xl" />
        {presentationMode !== "inline" ? (
          <div className="absolute inset-x-3 top-3 z-30 flex items-center justify-between sm:inset-x-8 sm:top-5">
            <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.2em] text-[#9ce7e9]">
              {presentationMode === "game" ? "Game view" : "Handheld view"}
            </span>
            <div className="flex items-center gap-2">
              {presentationMode === "handheld" ? (
                <button
                  type="button"
                  onClick={() => openPresentation("game")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#172943]/80 px-3 py-2 font-mono text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#dcecf1] backdrop-blur transition hover:bg-[#203858]"
                >
                  <MonitorPlay className="size-3.5" />
                  Game only
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openPresentation("handheld")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#172943]/80 px-3 py-2 font-mono text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#dcecf1] backdrop-blur transition hover:bg-[#203858]"
                >
                  <ExpandIcon className="size-3.5" />
                  Show handheld
                </button>
              )}
              <button
                type="button"
                onClick={closePresentation}
                aria-label="Close full-screen view"
                ref={presentationCloseRef}
                className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-[#172943]/80 text-[#dcecf1] backdrop-blur transition hover:bg-[#203858]"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
        <div
          className={`relative z-10 max-w-2xl ${
            presentationMode === "inline"
              ? "lg:absolute lg:left-10 lg:top-1/2 lg:max-w-[36%] lg:-translate-y-1/2 xl:left-14"
              : "hidden"
          }`}
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#9ce7e9]">
            Nine Lives · alpha build
          </p>
          <h1 className="mt-3 max-w-xl text-[2.1rem] font-semibold leading-[0.95] tracking-[-0.04em] text-[#f8f4e5] sm:mt-4 sm:text-6xl">
            A pocket-sized world of curious cats.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#b4c3d5] sm:mt-5 sm:text-lg">
            A browser RPG about finding, cataloguing, and caring for strange
            cats. The first Catalog loop runs from Napton to Hazelwood.
          </p>
        </div>

        <div
          className={`relative z-10 touch-none ${getPresentationDeviceClass(presentationMode)}`}
          style={
            presentationMode === "game"
              ? {
                  width: "min(100%, 1120px, calc((100dvh - 8rem) * 1.5))",
                }
              : undefined
          }
        >
          <div
            className={`@container mx-auto w-full ${
              presentationMode === "game"
                ? "rounded-[1.35rem] border border-[#3d5273] bg-[#0a1426] p-2 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:rounded-[1.8rem] sm:p-4"
                : "rounded-[2.8rem] border border-[#d6e7f2]/35 bg-gradient-to-br from-[#b4c7dc] via-[#8ea2c1] to-[#647999] p-3 shadow-[0_30px_45px_rgba(3,12,30,0.55),inset_1px_1px_0_rgba(255,255,255,0.55)] sm:p-5"
            }`}
          >
            <div
              className={`flex items-center justify-between gap-3 px-3 pb-3 sm:px-6 sm:pb-4 ${
                presentationMode === "game" ? "hidden" : ""
              }`}
            >
              <MorrowmewMark />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[#34455e]">
                  <span
                    className={`h-2.5 w-2.5 rounded-full border border-[#27354b] ${ready ? "bg-[#74e6b0] shadow-[0_0_12px_#74e6b0]" : "bg-[#f3a263]"}`}
                  />
                  <span className="hidden sm:inline">
                    {getStatusLabel(ready, started)}
                  </span>
                </div>
                {presentationMode === "inline" ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      ref={presentationInlineOpenerRef}
                      aria-label="Fullscreen"
                      onClick={() => openPresentation("handheld")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#4b5d78]/60 bg-[#b6c8dc]/55 px-2.5 py-1.5 font-mono text-[0.52rem] font-bold uppercase tracking-[0.12em] text-[#263449] transition hover:bg-[#d3e0ed]"
                    >
                      <ExpandIcon className="size-3" />
                      <span className="hidden sm:inline">Fullscreen</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Game only"
                      onClick={() => openPresentation("game")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#4b5d78]/60 bg-[#b6c8dc]/55 px-2.5 py-1.5 font-mono text-[0.52rem] font-bold uppercase tracking-[0.12em] text-[#263449] transition hover:bg-[#d3e0ed]"
                    >
                      <MonitorPlay className="size-3" />
                      <span className="hidden sm:inline">Game only</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`relative overflow-hidden bg-[#263449] ${
                presentationMode === "game"
                  ? "rounded-[0.95rem] border-[5px] border-[#263449] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:rounded-[1.25rem] sm:border-[8px]"
                  : "rounded-[1.7rem] border-[10px] border-[#263449] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.08),0_5px_0_rgba(255,255,255,0.28)] sm:border-[14px]"
              }`}
            >
              <div
                className={`pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-md bg-[#263449]/90 px-3 py-1 font-mono text-[0.5rem] font-bold uppercase tracking-[0.2em] text-[#b7cbe2] shadow-sm ${
                  presentationMode === "game" ? "hidden" : ""
                }`}
              >
                NL / 240 × 160
              </div>
              <div className="relative aspect-[3/2] w-full overflow-hidden bg-[#9bd5dc]">
                {!started ? (
                  <button
                    type="button"
                    onClick={startGame}
                    className="group absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#8ac5d4] bg-[url('/nine-lives/title-scene.png')] bg-cover bg-center p-5 text-center focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-8px] focus-visible:outline-[#fff4b8]"
                  >
                    <Image
                      src="/nine-lives/logo.png"
                      alt="Nine Lives"
                      width={270}
                      height={64}
                      priority
                      style={{ width: "58%", height: "auto" }}
                      className="max-w-[270px] drop-shadow-[3px_4px_0_rgba(33,44,48,0.65)] [image-rendering:pixelated] transition-transform group-hover:scale-105"
                    />
                    <span className="mt-auto whitespace-nowrap rounded-full border border-[#fff4b8]/70 bg-[#1a2a3d]/85 px-3 py-2 font-mono text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[#fff4b8] shadow-lg motion-safe:animate-pulse sm:px-5 sm:text-xs sm:tracking-[0.2em]">
                      Press START · or tap here
                    </span>
                  </button>
                ) : (
                  <iframe
                    ref={iframeRef}
                    src={GAME_URL}
                    allow="autoplay; fullscreen; gamepad"
                    title="Nine Lives"
                    className="h-full w-full border-0 bg-[#172238] [image-rendering:pixelated]"
                    onLoad={() => setFrameError(false)}
                    onError={() => setFrameError(true)}
                  />
                )}
              </div>
            </div>

            <div
              className={`mt-5 grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-3 px-3 pb-2 sm:mt-7 @xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @xl:gap-10 @xl:px-12 ${
                presentationMode === "game" ? "hidden" : ""
              }`}
            >
              <DPad onPress={press} onRelease={release} pressed={pressed} />
              <div className="col-span-2 row-start-2 flex flex-col items-center gap-2 self-end pb-1 @xl:col-span-1 @xl:row-start-auto">
                <div className="flex gap-2">
                  <DeviceButton
                    name="select"
                    label="Select"
                    onPress={press}
                    onRelease={release}
                    pressed={pressed.has("select")}
                  />
                  <DeviceButton
                    name="start"
                    label="Start"
                    onPress={press}
                    onRelease={release}
                    pressed={pressed.has("start")}
                  />
                </div>
                <button
                  type="button"
                  aria-label={
                    started ? "Power: focus Nine Lives" : "Power on Nine Lives"
                  }
                  onClick={startGame}
                  className="group flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[#34455e] transition hover:text-[#17243a]"
                >
                  <Power className="size-3.5 transition-transform group-hover:rotate-[-20deg]" />{" "}
                  Power
                </button>
              </div>
              <div className="col-start-2 row-start-1 flex min-w-0 justify-end @xl:col-start-auto @xl:row-start-auto">
                <div className="relative h-28 w-32">
                  <div className="absolute left-0 top-1">
                    <SpeakerGrille />
                  </div>
                  <div className="absolute right-8 top-0">
                    <FaceButton
                      name="b"
                      label="B"
                      onPress={press}
                      onRelease={release}
                      pressed={pressed.has("b")}
                    />
                  </div>
                  <div className="absolute bottom-0 right-0">
                    <FaceButton
                      name="a"
                      label="A"
                      onPress={press}
                      onRelease={release}
                      pressed={pressed.has("a")}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`flex flex-wrap items-center justify-between gap-3 px-4 pt-1 font-mono text-[0.58rem] font-bold uppercase tracking-[0.16em] text-[#34455e] sm:px-12 ${
                presentationMode === "game" ? "hidden" : ""
              }`}
            >
              <span>Original Morrowmew hardware · shell 01</span>
              <span className="rounded border border-[#4f617f]/50 bg-[#b6c8dc]/50 px-2 py-1 text-[0.5rem]">
                NINE LIVES · A01
              </span>
              <div
                className="flex items-center gap-2"
                role="img"
                aria-label="Shell colourways"
              >
                <span
                  className="h-3 w-3 rounded-full border border-white/60 bg-[#8ea2c1]"
                  title="Moonmilk"
                />
                <span
                  className="h-3 w-3 rounded-full border border-white/60 bg-[#8bbfc2]"
                  title="Mintpaw"
                />
                <span
                  className="h-3 w-3 rounded-full border border-white/60 bg-[#d98d6c]"
                  title="Emberstripe"
                />
                <span className="hidden text-[0.5rem] tracking-normal sm:inline">
                  Moonmilk · Mintpaw · Emberstripe
                </span>
                <span className="sr-only">
                  Moonmilk, Mintpaw, Emberstripe shell colourways
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`relative z-10 mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b1528]/60 p-4 text-sm text-[#b4c3d5] sm:flex-row sm:items-center sm:justify-between ${
            presentationMode !== "inline" ? "hidden" : ""
          }`}
        >
          <p>
            {frameError
              ? "The game could not be framed here yet."
              : "The alpha may still be waking up behind the frame."}{" "}
            Open it directly if the screen stays quiet.
          </p>
          <Link
            href={GAME_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#fff4b8] underline-offset-4 hover:underline"
          >
            Open Nine Lives in a new tab <ExternalLinkIcon className="size-4" />
          </Link>
        </div>
      </dialog>

      <section className="grid gap-5 md:grid-cols-2">
        <article className="glass-card p-6 sm:p-8">
          <p className="section-eyebrow text-[#83d6d8]">About the alpha</p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            A short first loop, made to be replayed.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            This is a Catalog-loop alpha. Start in Napton, catch and catalog
            cats on the first routes, and follow the build to Hazelwood. More
            arcs come later.
          </p>
        </article>
        <article className="glass-card p-6 sm:p-8">
          <p className="section-eyebrow text-[#f1a27f]">How to play</p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Use the handheld or your keyboard.
          </h2>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
            {KEYMAP.map(([action, keys]) => (
              <div key={action} className="contents">
                <dt className="font-semibold text-foreground">{action}</dt>
                <dd className="font-mono text-xs text-muted-foreground">
                  {keys}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-muted-foreground">
            Click the game screen once to give it keyboard focus. Hold any
            button for continuous input.
          </p>
        </article>
      </section>

      <section className="glass-card p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-eyebrow text-[#f1a27f]">
              Credits & asset sets
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">
              The people and packs behind Nine Lives.
            </h2>
          </div>
          <Link
            href="https://github.com/beastyrabbit/nine-lives"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <GithubIcon className="size-4" /> Nine Lives on GitHub
          </Link>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Every pack below is listed from the game repository&apos;s source of
          truth. Licence badges show the terms that travel with each asset.
        </p>
        <div className="mt-7 space-y-8">
          {[...creditsByGroup.entries()].map(([group, credits]) => (
            <div key={group}>
              <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#83d6d8]">
                {group}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {credits.map((credit) => (
                  <CreditRow
                    key={`${credit.group}-${credit.title}`}
                    credit={credit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="pb-3 text-center text-xs leading-relaxed text-muted-foreground">
        The Morrowmew handheld is an original design for this page and is not
        affiliated with any console maker.
      </p>
    </main>
  );
}

function CreditRow({ credit }: Readonly<{ credit: NineLivesCredit }>) {
  return (
    <details className="group rounded-2xl border border-border/60 bg-background/40 p-4 open:bg-background/70">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold text-foreground">
            {credit.title}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {credit.author}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-[#83d6d8]/30 bg-[#83d6d8]/10 px-2.5 py-1 font-mono text-[0.6rem] font-bold text-[#83d6d8]">
          {credit.license.replace(" Unported", "")}
        </span>
      </summary>
      <div className="mt-4 space-y-3 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          <Link
            href={credit.source}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            {credit.source}
          </Link>
        </p>
        <p>
          <span className="font-semibold text-foreground">Licence:</span>{" "}
          <Link
            href={credit.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            {credit.license}
          </Link>
          . {credit.creditRequired}
        </p>
        <p>
          <span className="font-semibold text-foreground">Credit:</span>{" "}
          {credit.creditLine}
        </p>
        {credit.note ? <p className="text-[#f1a27f]">{credit.note}</p> : null}
      </div>
    </details>
  );
}

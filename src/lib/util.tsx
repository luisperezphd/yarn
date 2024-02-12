import { useCallback, useEffect, useState } from "react";

export function useRedrawComponent() {
  const [, setTick] = useState(0);
  return useCallback(() => setTick((tick) => tick + 1), []);
}

export function getHash() {
  return decodeURIComponent(window.location.hash.replace("#", ""));
}

function setHash(hash: string) {
  window.location.hash = hash;
}

export function useHashState(): [string, (hash: string) => void] {
  const redraw = useRedrawComponent();

  useEffect(() => {
    const onHashChanged = () => {
      redraw();
    };

    window.addEventListener("hashchange", onHashChanged);

    return () => {
      window.removeEventListener("hashchange", onHashChanged);
    };
  }, [redraw]);

  const userSetHash = useCallback((hash: string) => {
    setHash(hash);
  }, []);

  return [getHash() ?? "", userSetHash];
}

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function noop() {
  // do nothing
}

export function px(value: number): string {
  return `${value}px`;
}

export function Img(props: React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>) {
  // delibrately use an image in nextjs
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt} />;
}

export function nullthrows<T>(value: T | null | undefined, message?: string): T {
  if (value == null) {
    throw new Error("nullthrows: " + (message ?? "value is null or undefined"));
  }

  return value;
}

export function now() {
  return new Date().getTime();
}

export function getRelativeTimeString(elapsedMillis: number) {
  const elapsedSeconds = elapsedMillis / 1000;

  if (elapsedSeconds < 60) {
    return "now";
  }

  const elapsedMinutes = elapsedSeconds / 60;
  if (elapsedMinutes < 60) {
    return `${Math.floor(elapsedMinutes)}m`;
  }

  const elapsedHours = elapsedMinutes / 60;
  if (elapsedHours < 24) {
    return `${Math.floor(elapsedHours)}h`;
  }

  const elapsedDays = elapsedHours / 24;
  if (elapsedDays < 7) {
    return `${Math.floor(elapsedDays)}d`;
  }

  const elapsedWeeks = elapsedDays / 7;
  if (elapsedWeeks < 4) {
    return `${Math.floor(elapsedWeeks)}w`;
  }

  const elapsedMonths = elapsedWeeks / 4;
  if (elapsedMonths < 12) {
    return `${Math.floor(elapsedMonths)}m`;
  }

  const elapsedYears = elapsedMonths / 12;
  return `${Math.floor(elapsedYears)}y`;
}

export function call<T>(fn: () => T): T {
  return fn();
}

export function promiseDoneCall<T>(fn: () => Promise<T>): void {
  promiseDone(call(fn));
}

export function promiseDone(promise: Promise<any>) {
  const callError = new Error();
  promise.catch((e) => {
    console.error("promiseDone", e, callError.stack);
  });
}

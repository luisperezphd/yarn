import { cn, px } from "./util";

export function VerticalDivider(props: { className?: string }) {
  return <div className={cn("bg-zinc-200", props.className ?? "h-10 w-[2px]")} />;
}

export function Divider(props: { className?: string }) {
  return <div className={cn("border-b border-b-zinc-300", props.className)} />;
}

export function FlexRow(props: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <div className={cn("flex", "flex-row", props.className)} style={{ gap: props.gap == null ? undefined : px(props.gap) }}>
      {props.children}
    </div>
  );
}

export function FlexColumn(props: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <div className={cn("flex", "flex-col", props.className)} style={{ gap: props.gap == null ? undefined : px(props.gap) }}>
      {props.children}
    </div>
  );
}

export function UIText(props: { children: React.ReactNode; className?: string }) {
  return <p className={cn(props.className)}>{props.children}</p>;
}

export function Button(props: { label: string; onClick: () => void; isDisabled?: boolean; className?: string }) {
  return (
    <button onClick={props.onClick} disabled={props.isDisabled} className={cn("font-semibold disabled:bg-zinc-400 rounded-full px-4 pt-1.5 pb-2 text-white disabled:cursor-not-allowed bg-black", props.className)}>
      {props.label}
    </button>
  );
}

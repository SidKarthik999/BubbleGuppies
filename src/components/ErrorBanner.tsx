import type { ReactNode } from "react";

type Props = {
  kind?: "error" | "warn" | "info";
  children: ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
};

export function ErrorBanner({ kind = "error", children, onDismiss, action }: Props) {
  return (
    <div className={`banner ${kind}`} role="alert">
      <span style={{ flex: 1 }}>{children}</span>
      {action && (
        <button onClick={action.onClick} style={{ flexShrink: 0 }}>
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ flexShrink: 0 }}>
          ✕
        </button>
      )}
    </div>
  );
}

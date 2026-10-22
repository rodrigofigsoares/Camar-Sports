import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ArrowUpRight, Copy, Check } from "lucide-react";
import type { Team } from "../domain/model";
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);
  function isOutside(dialog: HTMLDialogElement, x: number, y: number) {
    const bounds = dialog.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  }
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={close}
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget &&
          isOutside(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerCancel={() => { pressedOutside.current = false; }}
      onClick={(event) => {
        const shouldClose = pressedOutside.current &&
          event.target === event.currentTarget &&
          isOutside(event.currentTarget, event.clientX, event.clientY);
        pressedOutside.current = false;
        if (shouldClose) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Badge({ team }: { team?: Team }) {
  return (
    <span
      className="team-badge"
      style={{ background: team?.color ?? "#303633", color: team?.textColor }}
    >
      {team?.shortName.slice(0, 2).toUpperCase() ?? "?"}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">＋</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>
      {value === "live" && <i />}
      {{ live: "Ao vivo", scheduled: "Agendada", done: "Encerrada" }[value] ??
        value}
    </span>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return children ? (
    <div className="notice" role="alert">
      {children}
    </div>
  ) : null;
}
export function UrlBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="url-box">
      <input
        aria-label="URL do overlay"
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <button
        title="Copiar URL"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <a
        className="button"
        title="Abrir overlay"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <ArrowUpRight size={17} />
      </a>
    </div>
  );
}
export function Confirm({
  title,
  text,
  confirm,
  close,
}: {
  title: string;
  text: string;
  confirm: () => void;
  close: () => void;
}) {
  return (
    <Modal title={title} close={close}>
      <p className="muted">{text}</p>
      <div className="modal-actions">
        <button onClick={close}>Cancelar</button>
        <button className="danger" onClick={confirm}>
          Confirmar
        </button>
      </div>
    </Modal>
  );
}

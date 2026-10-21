import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function OverlayCrossfade({
  sceneKey,
  children,
}: {
  sceneKey: string;
  children: ReactNode;
}) {
  const last = useRef({ key: sceneKey, node: children });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [previous, setPrevious] = useState<{
    key: string;
    node: ReactNode;
  } | null>(null);
  useLayoutEffect(() => {
    if (last.current.key !== sceneKey) {
      clearTimeout(timer.current);
      setPrevious(last.current);
      timer.current = setTimeout(() => setPrevious(null), 650);
    }
    last.current = { key: sceneKey, node: children };
  }, [sceneKey, children]);
  useLayoutEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="overlay-crossfade">
      {previous && (
        <div
          key={`out-${previous.key}`}
          className="overlay-crossfade-layer outgoing"
          aria-hidden="true"
        >
          {previous.node}
        </div>
      )}
      <div key={sceneKey} className="overlay-crossfade-layer incoming">
        {children}
      </div>
    </div>
  );
}

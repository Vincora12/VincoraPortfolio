import { useEffect, useRef } from 'react';
import type {
  DesignScreenId,
  DesignSelection,
  HostMessage,
  PreviewMessage,
} from './types';

export function DesignLabPreviewFrame({
  screen,
  cssText,
  inspect,
  onSelect,
}: {
  screen: DesignScreenId;
  cssText: string;
  inspect: boolean;
  onSelect: (selection: DesignSelection) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);

  const send = (message: HostMessage) => {
    ref.current?.contentWindow?.postMessage(message, window.location.origin);
  };

  useEffect(() => {
    const receive = (event: MessageEvent<PreviewMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== ref.current?.contentWindow) return;
      if (event.data?.type === 'VINZ_DESIGN_READY') {
        send({ type: 'VINZ_DESIGN_SET_INSPECT', enabled: inspect });
        send({ type: 'VINZ_DESIGN_APPLY_CSS', cssText });
      }
      if (event.data?.type === 'VINZ_DESIGN_SELECTION') {
        onSelect(event.data.selection);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [inspect, cssText, onSelect]);

  useEffect(() => {
    send({ type: 'VINZ_DESIGN_SET_INSPECT', enabled: inspect });
  }, [inspect]);

  useEffect(() => {
    send({ type: 'VINZ_DESIGN_APPLY_CSS', cssText });
  }, [cssText]);

  return (
    <iframe
      ref={ref}
      title={`VINZ.MON real component preview: ${screen}`}
      className="designlab__preview"
      src={`/?design-preview=${encodeURIComponent(screen)}`}
    />
  );
}

import { useEffect } from 'react';
import type {
  DesignScreenId,
  DesignSelection,
  HostMessage,
  PreviewMessage,
} from './types';

const cleanText = (el: HTMLElement) =>
  (el.innerText || el.getAttribute('aria-label') || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

const selectionOf = (
  screen: DesignScreenId,
  el: HTMLElement,
): DesignSelection => {
  const rect = el.getBoundingClientRect();
  return {
    screen,
    elementId:
      el.dataset.pezzo ||
      el.getAttribute('data-slot') ||
      el.getAttribute('aria-label') ||
      el.classList[0] ||
      el.tagName.toLowerCase(),
    tag: el.tagName.toLowerCase(),
    classes: [...el.classList],
    text: cleanText(el),
    dataPezzo: el.dataset.pezzo,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
};

export function DesignInspectorBridge({
  screen,
}: {
  screen: DesignScreenId;
}) {
  useEffect(() => {
    let inspectEnabled = true;

    const style = document.createElement('style');
    style.id = 'vinz-design-lab-patch';
    document.head.appendChild(style);

    const outline = document.createElement('div');
    Object.assign(outline.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      border: '2px dashed #ff4d00',
      display: 'none',
    });
    document.body.appendChild(outline);

    const draw = (el: HTMLElement | null) => {
      if (!inspectEnabled || !el) {
        outline.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(outline.style, {
        display: 'block',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    };

    const hover = (event: PointerEvent) => {
      if (!inspectEnabled) return;
      draw(event.target instanceof HTMLElement ? event.target : null);
    };

    const click = (event: MouseEvent) => {
      if (!inspectEnabled) return;
      const target =
        event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      // Inspect mode never allows the product component to execute its click.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const message: PreviewMessage = {
        type: 'VINZ_DESIGN_SELECTION',
        selection: selectionOf(screen, target),
      };
      window.parent.postMessage(message, window.location.origin);
      draw(target);
    };

    const host = (event: MessageEvent<HostMessage>) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'VINZ_DESIGN_SET_INSPECT') {
        inspectEnabled = msg.enabled;
        if (!inspectEnabled) draw(null);
      }
      if (msg.type === 'VINZ_DESIGN_APPLY_CSS') {
        style.textContent = msg.cssText;
      }
      if (msg.type === 'VINZ_DESIGN_CLEAR_PATCH') {
        style.textContent = '';
      }
    };

    window.addEventListener('pointermove', hover, true);
    window.addEventListener('click', click, true);
    window.addEventListener('message', host);

    const ready: PreviewMessage = { type: 'VINZ_DESIGN_READY', screen };
    window.parent.postMessage(ready, window.location.origin);

    return () => {
      window.removeEventListener('pointermove', hover, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('message', host);
      outline.remove();
      style.remove();
    };
  }, [screen]);

  return null;
}

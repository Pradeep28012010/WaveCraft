/**
 * Picture-in-Picture Manager for WaveCraft
 * Provides:
 * 1. Document Picture-in-Picture (Chromium Desktop native always-on-top window)
 * 2. Canvas-streamed Video Picture-in-Picture fallback (Safari / Firefox)
 * 3. In-App Draggable Liquid-Glass Overlay (Universal / Mobile)
 */

export interface PipWindowOptions {
  width?: number;
  height?: number;
  title?: string;
}

export function isDocumentPiPSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

export function isVideoPiPSupported(): boolean {
  return typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;
}

let activePipWindow: Window | null = null;
let onCloseCallback: (() => void) | null = null;

/**
 * Copies all active styles and fonts from the host document into the Document PiP window
 */
export function copyStylesToPipWindow(pipWin: Window): void {
  try {
    // 1. Copy <link rel="stylesheet"> elements
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach((link) => {
      const cloned = pipWin.document.createElement('link');
      cloned.rel = 'stylesheet';
      cloned.href = (link as HTMLLinkElement).href;
      pipWin.document.head.appendChild(cloned);
    });

    // 2. Copy <style> elements (including Tailwind CSS v4 injected styles)
    const styles = document.querySelectorAll('style');
    styles.forEach((style) => {
      const cloned = pipWin.document.createElement('style');
      cloned.textContent = style.textContent;
      pipWin.document.head.appendChild(cloned);
    });

    // 3. Fallback for dynamically parsed CSSStyleSheets
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          if (sheet.cssRules && sheet.cssRules.length > 0) {
            // Check if already covered by an existing style element
            const alreadyCopied = Array.from(pipWin.document.querySelectorAll('style')).some(
              (s) => s.textContent?.includes(sheet.cssRules[0]?.cssText?.slice(0, 30) || '___')
            );
            if (!alreadyCopied) {
              const newStyle = pipWin.document.createElement('style');
              Array.from(sheet.cssRules).forEach((rule) => {
                newStyle.appendChild(pipWin.document.createTextNode(rule.cssText));
              });
              pipWin.document.head.appendChild(newStyle);
            }
          }
        } catch {
          // Cross-origin sheets safely ignored
        }
      });
    } catch {}

    // Apply standard dark theme and liquid glass background to body
    pipWin.document.documentElement.classList.add('dark');
    pipWin.document.body.className =
      'bg-[#06060c] text-white selection:bg-rose-500 selection:text-white m-0 p-0 overflow-hidden font-sans antialiased';
  } catch (err) {
    console.warn('[PiP] Failed to copy some stylesheets into PiP window:', err);
  }
}

/**
 * Opens a native Document Picture-in-Picture window
 */
export async function requestDocumentPiP(
  options: PipWindowOptions = {},
  onClose?: () => void
): Promise<Window | null> {
  if (!isDocumentPiPSupported()) {
    return null;
  }

  try {
    // If an existing PiP window is already open, close it cleanly first
    if (activePipWindow && !activePipWindow.closed) {
      activePipWindow.close();
      activePipWindow = null;
    }

    const docPiP = (window as any).documentPictureInPicture;
    const pipWin: Window = await docPiP.requestWindow({
      width: options.width || 420,
      height: options.height || 540,
      disallowReturnToOpener: false
    });

    activePipWindow = pipWin;
    onCloseCallback = onClose || null;

    copyStylesToPipWindow(pipWin);

    pipWin.document.title = options.title || 'WaveCraft • Floating Lyrics & Player';

    const handleClose = () => {
      activePipWindow = null;
      if (onCloseCallback) {
        onCloseCallback();
        onCloseCallback = null;
      }
    };

    pipWin.addEventListener('pagehide', handleClose, { once: true });
    pipWin.addEventListener('unload', handleClose, { once: true });

    return pipWin;
  } catch (err) {
    console.warn('[PiP] Failed to request Document Picture-in-Picture window:', err);
    return null;
  }
}

/**
 * Closes the active Document PiP window if open
 */
export function closeDocumentPiP(): void {
  if (activePipWindow && !activePipWindow.closed) {
    try {
      activePipWindow.close();
    } catch {}
    activePipWindow = null;
  }
  if (onCloseCallback) {
    onCloseCallback();
    onCloseCallback = null;
  }
}

export function getActiveDocumentPiP(): Window | null {
  if (activePipWindow && !activePipWindow.closed) {
    return activePipWindow;
  }
  activePipWindow = null;
  return null;
}

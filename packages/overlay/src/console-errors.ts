export interface CapturedError {
  message: string;
  stack?: string;
  at: number;
}

const MAX_ERRORS = 20;
const buffer: CapturedError[] = [];
const listeners = new Set<(errors: CapturedError[]) => void>();
let installed = false;

function push(message: string, stack?: string): void {
  buffer.push({ message, stack: stack?.split('\n').slice(0, 6).join('\n'), at: Date.now() });
  if (buffer.length > MAX_ERRORS) buffer.shift();
  for (const fn of listeners) fn([...buffer]);
}

export function installErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) => {
    if (ev.error instanceof Error) push(ev.error.message, ev.error.stack);
    else push(String(ev.message));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    if (r instanceof Error) push(`unhandled rejection: ${r.message}`, r.stack);
    else push(`unhandled rejection: ${String(r)}`);
  });
}

export function recentErrors(): CapturedError[] {
  return [...buffer];
}

export function clearErrors(): void {
  buffer.length = 0;
  for (const fn of listeners) fn([]);
}

export function onErrors(fn: (errors: CapturedError[]) => void): () => void {
  listeners.add(fn);
  fn([...buffer]);
  return () => listeners.delete(fn);
}

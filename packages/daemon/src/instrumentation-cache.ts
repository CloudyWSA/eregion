import type { SelectedComponent, SelectionPayload } from '@eregion/protocol';

/**
 * Instrumentation state fed by the overlay over WS. The MCP tools answer from
 * here — the AI never waits on the browser (the selection arrived before the
 * question) and a click never triggers the AI (lazy context).
 */
export class InstrumentationCache {
  private selection: SelectionPayload | null = null;

  setSelection(payload: SelectionPayload): void {
    this.selection = payload;
  }

  getSelection(): SelectionPayload | null {
    return this.selection;
  }

  getComponent(id: string): SelectedComponent | null {
    return this.selection?.selection.find((c) => c.id === id) ?? null;
  }

  /**
   * Compact refs attached to the user's message when they send with an active
   * selection (~60–120 tokens per component; the detail stays in the tools).
   */
  compactRefs(): string[] {
    if (!this.selection) return [];
    const refs: string[] = [];
    const area = this.selection.area;
    if (area) {
      const [, , w, h] = area.rect;
      const where = area.container
        ? `inside ${area.container.name} — ${area.container.src.file}:${area.container.src.line} (insertion point)`
        : 'free space on the page';
      refs.push(`<area selected: ${Math.round(w)}x${Math.round(h)}px, ${where}>`);
    }
    refs.push(...this.selection.selection.map((c) => {
      const ref = c.src ?? c.tpl;
      const where = ref ? ` — ${ref.file}:${ref.line}` : '';
      const http = c.http?.length ? `, ${c.http.length} request(s)` : '';
      return `<selected ${c.id}: ${c.name}${where}${http}>`;
    }));
    return refs;
  }
}

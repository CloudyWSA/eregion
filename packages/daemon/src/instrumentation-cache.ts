import type { SelectedComponent, SelectionPayload } from '@eregion/protocol';

/**
 * Estado de instrumentação alimentado pelo overlay via WS. As MCP tools
 * respondem daqui — a IA nunca espera o browser (a seleção já chegou antes
 * da pergunta) e o clique nunca dispara a IA (contexto lazy).
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
   * Referências compactas anexadas à mensagem do usuário quando ele envia com
   * seleção ativa (~60–120 tokens por componente; o detalhe fica nas tools).
   */
  compactRefs(): string[] {
    if (!this.selection) return [];
    return this.selection.selection.map((c) => {
      const ref = c.src ?? c.tpl;
      const where = ref ? ` — ${ref.file}:${ref.line}` : '';
      const http = c.http?.length ? `, ${c.http.length} request(s)` : '';
      return `<selecionado ${c.id}: ${c.name}${where}${http}>`;
    });
  }
}

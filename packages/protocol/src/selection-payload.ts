import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

/**
 * Referência a uma posição em um arquivo fonte, sempre relativa ao root do
 * repositório (nunca absoluta — o payload trafega entre máquina e browser).
 * line/column são 1-based (convenção de editor, não de Babel).
 */
export const SourceRef = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  column: z.number().int().min(1).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const HttpActivity = z.object({
  /** Resumo humano-legível: "GET /api/orders?status=open → 200 (142ms)" */
  req: z.string(),
  traceId: z.string().optional(),
  /** Call site que originou a request, quando atribuível */
  origin: SourceRef.optional(),
});
export type HttpActivity = z.infer<typeof HttpActivity>;

/**
 * Um componente selecionado, já resumido pelo overlay. Valores de props/state
 * chegam como strings truncadas — o detalhe completo fica atrás de `refs`,
 * expansível sob demanda pelo daemon (nunca embutido no payload).
 */
export const SelectedComponent = z.object({
  /** Estável durante a seleção corrente: "s1", "s2", … */
  id: z.string().min(1),
  name: z.string().min(1),
  framework: z.enum(['react', 'angular']),
  /** Classe/função do componente */
  src: SourceRef.optional(),
  /** Elemento clicado no template/JSX */
  tpl: SourceRef.optional(),
  dom: z.object({
    tag: z.string(),
    /** [x, y, largura, altura] em px na viewport */
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    text: z.string().max(80).optional(),
  }),
  props: z.record(z.string()).optional(),
  state: z.record(z.string()).optional(),
  /** "OrderService → src/app/orders/order.service.ts" */
  deps: z.array(z.string()).optional(),
  /** Com dedupe: "OrderRowComponent ×12 → src/app/orders/order-row/…:9" */
  children: z.array(z.string()).optional(),
  http: z.array(HttpActivity).optional(),
  /** Chaves expansíveis: fullProps, fullState, domHtml, trace:<id> */
  refs: z.record(z.string()).optional(),
});
export type SelectedComponent = z.infer<typeof SelectedComponent>;

export const SelectionPayload = z.object({
  v: z.literal(PROTOCOL_VERSION),
  app: z.object({
    framework: z.string(),
    name: z.string().optional(),
    route: z.string().optional(),
  }),
  selection: z.array(SelectedComponent),
});
export type SelectionPayload = z.infer<typeof SelectionPayload>;

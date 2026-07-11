import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

/**
 * Position in a source file, always relative to the repo root (never absolute —
 * the payload travels between machine and browser). line/column are 1-based
 * (editor convention, not Babel's).
 */
export const SourceRef = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
  column: z.number().int().min(1).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const HttpActivity = z.object({
  /** Human-readable summary: "GET /api/orders?status=open → 200 (142ms)" */
  req: z.string(),
  traceId: z.string().optional(),
  /** Call site that issued the request, when attributable */
  origin: SourceRef.optional(),
});
export type HttpActivity = z.infer<typeof HttpActivity>;

/**
 * A selected component, already summarized by the overlay. Prop/state values
 * arrive as truncated strings — full detail lives behind `refs`, expanded on
 * demand by the daemon (never inlined in the payload).
 */
export const SelectedComponent = z.object({
  /** Stable during the current selection: "s1", "s2", … */
  id: z.string().min(1),
  name: z.string().min(1),
  framework: z.enum(['react', 'angular']),
  /** Component class/function */
  src: SourceRef.optional(),
  /** Element clicked in the template/JSX */
  tpl: SourceRef.optional(),
  dom: z.object({
    tag: z.string(),
    /** [x, y, width, height] in px in the viewport */
    rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    text: z.string().max(80).optional(),
  }),
  props: z.record(z.string()).optional(),
  state: z.record(z.string()).optional(),
  /** "OrderService → src/app/orders/order.service.ts" */
  deps: z.array(z.string()).optional(),
  /** deduped: "OrderRowComponent ×12 → src/app/orders/order-row/…:9" */
  children: z.array(z.string()).optional(),
  http: z.array(HttpActivity).optional(),
  /** Expandable keys: fullProps, fullState, domHtml, trace:<id> */
  refs: z.record(z.string()).optional(),
});
export type SelectedComponent = z.infer<typeof SelectedComponent>;

/**
 * Marquee area drawn by the dev: may cover components (adapt them) or empty
 * space (create something there). The container is the innermost tagged element
 * that fully contains the area — the code insertion point.
 */
export const AreaSelection = z.object({
  /** [x, y, width, height] in the viewport at capture time */
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  container: z
    .object({ name: z.string(), src: SourceRef })
    .optional(),
});
export type AreaSelection = z.infer<typeof AreaSelection>;

/** Component present on the page (compact inventory for lazy context). */
export const PageComponent = z.object({
  name: z.string(),
  src: SourceRef,
  count: z.number().int().min(1),
});
export type PageComponent = z.infer<typeof PageComponent>;

export const SelectionPayload = z.object({
  v: z.literal(PROTOCOL_VERSION),
  app: z.object({
    framework: z.string(),
    name: z.string().optional(),
    route: z.string().optional(),
    /** Unique components rendered on the current page, with count. */
    components: z.array(PageComponent).optional(),
  }),
  selection: z.array(SelectedComponent),
  area: AreaSelection.optional(),
});
export type SelectionPayload = z.infer<typeof SelectionPayload>;

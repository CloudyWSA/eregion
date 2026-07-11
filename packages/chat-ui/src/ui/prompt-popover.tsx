import { useEffect, useRef, useState } from 'preact/hooks';
import { areaAnchor, type AreaState, type ComponentHit } from '@eregion/overlay';
import type { ModelOption } from '@eregion/protocol';
import { Anchored } from './anchored.js';

interface Props {
  selected: ComponentHit[];
  area: AreaState | null;
  models: ModelOption[];
  selectedModel: string;
  onModelChange(id: string): void;
  onDispatch(prompt: string): void;
}

export function PromptPopover({ selected, area, models, selectedModel, onModelChange, onDispatch }: Props) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const anchor = area ? areaAnchor(area) : selected[selected.length - 1]?.element;

  useEffect(() => {
    if (anchor) inputRef.current?.focus();
  }, [anchor === undefined]);

  if (!anchor) return null;

  const send = () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt('');
    onDispatch(text);
  };

  return (
    <Anchored anchor={anchor} estimatedHeight={86}>
      <div class="eg-ask">
        <div class="eg-ask-row eg-drag">
          <span class="eg-chips">
            {area && (
              <span class="eg-chip eg-chip-area">
                ▧ area{area.container ? ` in ${area.container.name}` : ''}
              </span>
            )}
            {selected.map((s, i) => (
              <span key={i} class="eg-chip">{s.name}</span>
            ))}
          </span>
          {models.length > 0 && (
            <label class="eg-model" title="Model that runs this request">
              ◈ {models.find((m) => m.id === selectedModel)?.name ?? 'Default'} ▾
              <select
                class="eg-model-select"
                value={selectedModel}
                onChange={(e) => onModelChange((e.target as HTMLSelectElement).value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <input
          ref={inputRef}
          class="eg-ask-input"
          value={prompt}
          placeholder={
            area
              ? selected.length > 0
                ? `What to do in this area (${selected.length} component(s) inside)?`
                : 'What should be created here?'
              : selected.length === 1
                ? `What to change in ${selected[0]!.name}?`
                : `What to change in these ${selected.length}?`
          }
          onInput={(e) => setPrompt((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
            e.stopPropagation();
          }}
        />
        <div class="eg-ask-hint">↵ send · shift+click adds · esc to cancel</div>
      </div>
    </Anchored>
  );
}

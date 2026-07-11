import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentHit } from '@eregion/overlay';
import type { ModelOption } from '@eregion/protocol';
import { Anchored } from './anchored.js';

interface Props {
  selected: ComponentHit[];
  models: ModelOption[];
  selectedModel: string;
  onModelChange(id: string): void;
  onDispatch(prompt: string): void;
}

/**
 * O prompt mora ao lado do componente: clicou, a caixa abre ali, escreve e
 * Enter — vira job no mesmo lugar. Shift+clique soma componentes; a caixa
 * segue o último clicado e mostra todos como chips.
 */
export function PromptPopover({ selected, models, selectedModel, onModelChange, onDispatch }: Props) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const anchor = selected[selected.length - 1]?.element;

  useEffect(() => {
    if (anchor) inputRef.current?.focus();
  }, [anchor]);

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
            {selected.map((s, i) => (
              <span key={i} class="eg-chip">{s.name}</span>
            ))}
          </span>
          {models.length > 0 && (
            <label class="eg-model" title="Modelo que executa este pedido">
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
          placeholder={selected.length === 1 ? `O que mudar em ${selected[0]!.name}?` : `O que mudar nestes ${selected.length}?`}
          onInput={(e) => setPrompt((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
            e.stopPropagation();
          }}
        />
        <div class="eg-ask-hint">↵ enviar · shift+clique adiciona · esc cancela</div>
      </div>
    </Anchored>
  );
}

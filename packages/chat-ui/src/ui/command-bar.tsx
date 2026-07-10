import { useEffect, useRef, useState } from 'preact/hooks';
import type { EngineState } from '@eregion/overlay';
import type { ModelOption } from '@eregion/protocol';

interface Props {
  engine: EngineState;
  models: ModelOption[];
  selectedModel: string;
  onModelChange(id: string): void;
  onDispatch(prompt: string): void;
}

/**
 * A assinatura do Eregion: selecionou → a barra materializa embaixo com os
 * componentes como chips; escreve o que quer, Enter, e o pedido vira um job.
 * Sem abrir painel, sem trocar de contexto.
 */
export function CommandBar({ engine, models, selectedModel, onModelChange, onDispatch }: Props) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const count = engine.selected.length;

  useEffect(() => {
    if (count > 0) inputRef.current?.focus();
  }, [count]);

  if (count === 0) return null;

  const placeholder =
    count === 1
      ? `O que mudar em ${engine.selected[0]!.name}?`
      : `O que mudar nestes ${count} componentes?`;

  const dispatch = () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt('');
    onDispatch(text);
  };

  return (
    <div class="eg-cmd">
      <span class="eg-cmd-glyph">⟡{count > 1 ? count : ''}</span>
      <span class="eg-cmd-chips">
        {engine.selected.slice(0, 3).map((s, i) => (
          <span key={i} class="eg-chip">{s.name}</span>
        ))}
        {count > 3 && <span class="eg-chip">+{count - 3}</span>}
      </span>
      <input
        ref={inputRef}
        class="eg-cmd-input"
        value={prompt}
        placeholder={placeholder}
        onInput={(e) => setPrompt((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') dispatch();
          e.stopPropagation();
        }}
      />
      {models.length > 0 && (
        <select
          class="eg-cmd-model"
          value={selectedModel}
          title="Modelo que executa este pedido"
          onChange={(e) => onModelChange((e.target as HTMLSelectElement).value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}
      <span class="eg-cmd-hint">↵ enviar</span>
    </div>
  );
}

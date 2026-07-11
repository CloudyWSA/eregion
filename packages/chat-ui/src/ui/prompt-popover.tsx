import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { areaAnchor, type AreaState, type ComponentHit } from '@eregion/overlay';
import type { ChatImage, ModelOption, PageComponent, SkillOption } from '@eregion/protocol';
import { Anchored } from './anchored.js';

interface Props {
  selected: ComponentHit[];
  area: AreaState | null;
  models: ModelOption[];
  skills: SkillOption[];
  selectedModel: string;
  pinned: { name: string; ref: string } | null;
  onPin(value: { name: string; ref: string } | null): void;
  pageComponents(): PageComponent[];
  onModelChange(id: string): void;
  onDispatch(prompt: string, variants: number, images: ChatImage[]): void;
}

export function PromptPopover({ selected, area, models, skills, selectedModel, pinned, onPin, pageComponents, onModelChange, onDispatch }: Props) {
  const [prompt, setPrompt] = useState('');
  const [variants, setVariants] = useState(1);
  const [images, setImages] = useState<ChatImage[]>([]);

  const slashQuery = useMemo(() => {
    if (!prompt.startsWith('/')) return null;
    const head = prompt.slice(1);
    return /^[\w:-]{0,30}$/.test(head) ? head.toLowerCase() : null;
  }, [prompt]);
  const slashMatches = useMemo(() => {
    if (slashQuery === null) return [];
    return skills.filter((k) => k.name.toLowerCase().startsWith(slashQuery)).slice(0, 6);
  }, [slashQuery, skills]);

  const onPaste = (e: ClipboardEvent): void => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    if (!item || images.length >= 4) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const comma = url.indexOf(',');
      setImages((prev) => [...prev, { mediaType: file.type, data: url.slice(comma + 1) }].slice(0, 4));
    };
    reader.readAsDataURL(file);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const anchor = area ? areaAnchor(area) : selected[selected.length - 1]?.element;

  const mentionQuery = useMemo(() => {
    const at = prompt.lastIndexOf('@');
    if (at < 0) return null;
    const tail = prompt.slice(at + 1);
    return /^[\w-]{0,24}$/.test(tail) ? tail.toLowerCase() : null;
  }, [prompt]);
  const mentions = useMemo(() => {
    if (mentionQuery === null) return [];
    return pageComponents()
      .filter((c) => c.name.toLowerCase().startsWith(mentionQuery))
      .slice(0, 5);
  }, [mentionQuery]);

  const completeMention = (c: PageComponent): void => {
    const at = prompt.lastIndexOf('@');
    setPrompt(`${prompt.slice(0, at)}@${c.name} (${c.src.file}:${c.src.line}) `);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (anchor) inputRef.current?.focus();
  }, [anchor === undefined]);

  if (!anchor) return null;

  const send = () => {
    const text = prompt.trim();
    if (!text && images.length === 0) return;
    setPrompt('');
    onDispatch(text || 'Implement what this image shows.', variants, images);
    setVariants(1);
    setImages([]);
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
            {selected.map((s, i) => {
              const ref = s.src ?? s.tpl;
              const isPinned = pinned?.name === s.name;
              return (
                <span key={i} class={`eg-chip ${isPinned ? 'eg-chip-pinned' : ''}`}>
                  {s.name}
                  {ref && (
                    <button
                      class="eg-pin"
                      title={isPinned ? 'Unpin style reference' : 'Pin as style reference for future requests'}
                      onClick={() => onPin(isPinned ? null : { name: s.name, ref: `${ref.file}:${ref.line}` })}
                    >
                      {isPinned ? '★' : '☆'}
                    </button>
                  )}
                </span>
              );
            })}
            {pinned && !selected.some((s) => s.name === pinned.name) && (
              <span class="eg-chip eg-chip-pinned">
                ★ {pinned.name}
                <button class="eg-pin" title="Unpin" onClick={() => onPin(null)}>✕</button>
              </span>
            )}
          </span>
          <button
            class={`eg-variants ${variants > 1 ? 'eg-variants-on' : ''}`}
            title="Generate N alternative versions in parallel (pick one, revert the rest)"
            onClick={() => setVariants(variants >= 3 ? 1 : variants + 1)}
          >
            ×{variants}
          </button>
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
        {images.length > 0 && (
          <span class="eg-chips">
            {images.map((img, i) => (
              <span key={i} class="eg-chip">
                🖼 image {i + 1}
                <button class="eg-pin" onClick={() => setImages(images.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
          </span>
        )}
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
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
            e.stopPropagation();
          }}
        />
        {slashMatches.length > 0 && (
          <div class="eg-mentions">
            {slashMatches.map((k) => (
              <button
                key={k.name}
                class="eg-mention"
                onClick={() => {
                  setPrompt(`/${k.name} `);
                  inputRef.current?.focus();
                }}
              >
                <span>/{k.name}{k.argumentHint ? ` ${k.argumentHint}` : ''}</span>
                <span class="eg-mention-meta">{k.description.slice(0, 48)}</span>
              </button>
            ))}
          </div>
        )}
        {mentions.length > 0 && (
          <div class="eg-mentions">
            {mentions.map((c) => (
              <button key={c.name + c.src.file} class="eg-mention" onClick={() => completeMention(c)}>
                <span>@{c.name}</span>
                <span class="eg-mention-meta">{c.src.file.slice(c.src.file.lastIndexOf('/') + 1)}:{c.src.line} ×{c.count}</span>
              </button>
            ))}
          </div>
        )}
        <div class="eg-ask-hint">↵ send · / skill · @ component · paste image · esc cancels</div>
      </div>
    </Anchored>
  );
}

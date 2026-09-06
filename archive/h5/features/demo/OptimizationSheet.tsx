import { useEffect, useRef } from 'react';
import { CONTENT_TYPES, CUSTOM_PROMPTS, FORMAT_OPTIONS, WRITING_STYLES, optimizedSegments } from './mock-data';
import { type AppState } from './demo-state';
import { Icon, StoryDrawing } from '../../components/Visuals';
export function MemoryIllustration({ kind }: { kind: string }) {
  const labels: Record<string, [string, string]> = {
    train: ['北去的列车', '一九六八'],
    home: ['记忆里的老屋', '桂花又香'],
    dinner: ['一桌团圆饭', '家的味道'],
  };
  const [title, note] = labels[kind] ?? labels.train;
  return (
    <figure className={`memory-art ${kind}`} aria-label={`文章配图：${title}`}>
      <StoryDrawing kind={kind} />
      <figcaption><strong>{title}</strong><small>{note}</small></figcaption>
    </figure>
  );
}

export function OptimizationSheet({
  state,
  patch,
  apply,
}: {
  state: AppState;
  patch: (next: Partial<AppState>) => void;
  apply: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); patch({ optimizeSheet: null }); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('*') ?? []).filter(element => element.tabIndex >= 0 && !element.hasAttribute('disabled'));
      const first = elements[0]; const last = elements.at(-1);
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [patch]);
  useEffect(() => { panel.current?.querySelector<HTMLElement>('#sheet-title')?.focus({ preventScroll: true }); }, [state.optimizeSheet]);
  const close = () => patch({ optimizeSheet: null });
  const choose = (choice: string) => patch({ optimizeChoice: choice, optimizeSheet: 'result' });
  const sheetTitles: Record<string, string> = {
    menu: '想怎样整理这篇文章？', content: '选择文章类型', style: '选择喜欢的文风',
    format: '整理格式与标点', image: '选择一张文章配图', custom: '告诉小文您的要求', result: '看看优化后的样子',
  };
  const optimizedPreview = optimizedSegments(state.segments, state.optimizeChoice).slice(0, 2);
  return (
    <div className="sheet-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section ref={panel} className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div><small><Icon name="spark" />小文的写作工具</small><h2 id="sheet-title" tabIndex={-1}>{sheetTitles[state.optimizeSheet ?? 'menu']}</h2></div>
          <div className="sheet-header-actions">
            {state.optimizeSheet !== 'menu' && <button type="button" aria-label="返回优化选项" onClick={() => patch({ optimizeSheet: 'menu' })}><Icon name="back" /></button>}
            <button type="button" aria-label="关闭" onClick={close}><Icon name="close" /></button>
          </div>
        </header>

        {state.optimizeSheet === 'menu' && (
          <div className="optimize-menu">
            <button type="button" onClick={() => patch({ optimizeSheet: 'content' })}><span><Icon name="book" /></span><b>内容类型</b><small>找到适合的表达</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'style' })}><span><Icon name="pen" /></span><b>文风调整</b><small>让文字更有您的味道</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'format' })}><span><Icon name="format" /></span><b>格式整理</b><small>分段、标点，井井有条</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'image' })}><span><Icon name="image" /></span><b>AI 配图</b><small>为文字添一幅画</small></button>
            <button className="wide" type="button" onClick={() => patch({ optimizeSheet: 'custom' })}><span><Icon name="spark" /></span><b>其他要求</b><small>想怎么改，直接告诉小文</small><Icon name="chevron" /></button>
          </div>
        )}

        {state.optimizeSheet === 'content' && <OptionList options={CONTENT_TYPES} selected={state.optimizeChoice} onChoose={choose} />}
        {state.optimizeSheet === 'style' && <OptionList options={WRITING_STYLES} selected={state.optimizeChoice} onChoose={choose} />}
        {state.optimizeSheet === 'format' && <OptionList options={FORMAT_OPTIONS} selected={state.optimizeChoice} onChoose={choose} />}

        {state.optimizeSheet === 'image' && (
          <div className="image-options">
            {(['train', 'home', 'dinner'] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => choose(`配图：${kind}`)}><MemoryIllustration kind={kind} /></button>
            ))}
          </div>
        )}

        {state.optimizeSheet === 'custom' && (
          <div className="custom-requirement">
            <div className="prompt-chips">{CUSTOM_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => patch({ customPrompt: prompt })}>{prompt}</button>)}</div>
            <textarea value={state.customPrompt} onChange={(event) => patch({ customPrompt: event.target.value })} placeholder="例如：把母亲送我上车的细节写得更感人……" aria-label="自定义优化要求" />
            <button className="primary-button" type="button" disabled={!state.customPrompt.trim()} onClick={() => choose(state.customPrompt.trim())}>让小文试着改改</button>
          </div>
        )}

        {state.optimizeSheet === 'result' && (
          <div className="optimization-result">
            <span className="choice-chip"><Icon name="spark" />{state.optimizeChoice.startsWith('配图：') ? '为文章添一幅画' : `按“${state.optimizeChoice}”优化`}</span>
            {state.optimizeChoice.startsWith('配图：') ? (
              <MemoryIllustration kind={state.optimizeChoice.replace('配图：', '')} />
            ) : (
              <div className="result-preview">
                {optimizedPreview.map((segment) => <p key={segment.id}>{segment.text}</p>)}
              </div>
            )}
            <ul>
              <li><Icon name="check" />保留了原来的内容和口吻</li>
              <li><Icon name="check" />{state.optimizeChoice.startsWith('配图：') ? '配图会放在第一段后面' : state.optimizeChoice === '诗歌' ? '重排了诗句、节奏和留白' : '调整了分段、标点和语句节奏'}</li>
            </ul>
            <div className="result-actions"><button type="button" onClick={close}>先不修改</button><button className="primary-button" type="button" onClick={apply}>应用优化</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function OptionList({ options, selected, onChoose }: { options: string[]; selected: string; onChoose: (option: string) => void }) {
  const descriptions: Record<string, string> = {
    '散文': '让画面与心情自然流淌', '生活随笔': '记下生活里的一点感受', '诗歌': '用诗句留下想说的话', '口述故事': '像聊天一样，娓娓道来',
    '朴实真诚': '不必修饰，真心就很动人', '温暖叙事': '把细节写得亲切、柔软', '文学散文': '多一点画面感与韵味', '轻松幽默': '轻轻松松，也带一点笑意',
    '自动分段': '在合适的地方停一停', '修正标点': '让句子读起来更顺畅', '添加小标题': '为每一段找到一个小主题',
  };
  return (
    <div className="option-list">
      {options.map((option) => (
        <button className={selected === option ? 'selected' : ''} key={option} type="button" aria-label={option} aria-pressed={selected === option} onClick={() => onChoose(option)}>
          <span className="option-copy"><b>{option}</b><small>{descriptions[option]}</small></span><Icon name={selected === option ? 'check' : 'chevron'} />
        </button>
      ))}
    </div>
  );
}

import { CONTENT_TYPES, CUSTOM_PROMPTS, FORMAT_OPTIONS, WRITING_STYLES, optimizedSegments } from './mock-data';
import { type AppState } from './demo-state';
export function MemoryIllustration({ kind }: { kind: string }) {
  const labels: Record<string, [string, string]> = {
    train: ['北去的列车', '一九六八'],
    home: ['记忆里的老屋', '桂花又香'],
    dinner: ['一桌团圆饭', '家的味道'],
  };
  const [title, note] = labels[kind] ?? labels.train;
  return (
    <figure className={`memory-art ${kind}`} aria-label={`文章配图：${title}`}>
      <div className="sun" /><div className="horizon" /><div className="art-shape" />
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
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div><small>文章优化</small><h2 id="sheet-title">{sheetTitles[state.optimizeSheet ?? 'menu']}</h2></div>
          <div className="sheet-header-actions">
            {state.optimizeSheet !== 'menu' && <button type="button" aria-label="返回优化选项" onClick={() => patch({ optimizeSheet: 'menu' })}>‹</button>}
            <button type="button" aria-label="关闭" onClick={close}>×</button>
          </div>
        </header>

        {state.optimizeSheet === 'menu' && (
          <div className="optimize-menu">
            <button type="button" onClick={() => patch({ optimizeSheet: 'content' })}><span>文</span><b>内容类型</b><small>散文、诗歌等</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'style' })}><span>风</span><b>文风调整</b><small>保持您的口吻</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'format' })}><span>序</span><b>格式整理</b><small>分段与标点</small></button>
            <button type="button" onClick={() => patch({ optimizeSheet: 'image' })}><span>景</span><b>AI 配图</b><small>选择故事画面</small></button>
            <button className="wide" type="button" onClick={() => patch({ optimizeSheet: 'custom' })}><span>✦</span><b>其他要求</b><small>直接告诉小文怎么改</small></button>
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
            <span className="choice-chip">按“{state.optimizeChoice.replace('配图：', '')}”优化</span>
            {state.optimizeChoice.startsWith('配图：') ? (
              <MemoryIllustration kind={state.optimizeChoice.replace('配图：', '')} />
            ) : (
              <div className="result-preview">
                {optimizedPreview.map((segment) => <p key={segment.id}>{segment.text}</p>)}
              </div>
            )}
            <ul>
              <li>保留了原来的内容和口吻</li>
              <li>{state.optimizeChoice.startsWith('配图：') ? '配图会放在第一段后面' : state.optimizeChoice === '诗歌' ? '重排了诗句、节奏和留白' : '调整了分段、标点和语句节奏'}</li>
            </ul>
            <div className="result-actions"><button type="button" onClick={close}>先不修改</button><button className="primary-button" type="button" onClick={apply}>应用优化</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function OptionList({ options, selected, onChoose }: { options: string[]; selected: string; onChoose: (option: string) => void }) {
  return (
    <div className="option-list">
      {options.map((option, index) => (
        <button className={selected === option ? 'selected' : ''} key={option} type="button" aria-pressed={selected === option} onClick={() => onChoose(option)}>
          <span>{['一', '二', '三', '四'][index]}</span><b>{option}</b><i aria-hidden="true">›</i>
        </button>
      ))}
    </div>
  );
}

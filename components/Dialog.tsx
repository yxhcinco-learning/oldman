import { useEffect, useRef, type ReactNode } from 'react';
import { BackIcon } from './Icons';

export function Dialog({ title, children, onClose, onBack }: { title: string; children: ReactNode; onClose: () => void; onBack?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => { el?.close(); previous?.focus(); };
  }, []);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('.sheet-header button')?.focus(); }, [title]);
  return <dialog ref={ref} className="product-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="sheet-header">{onBack && <button className="icon-button" type="button" onClick={onBack} aria-label="返回上一级"><BackIcon /></button>}<h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭">×</button></header>
    {children}
  </dialog>;
}

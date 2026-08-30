import { useEffect, useRef, type ReactNode } from 'react';
import { BackIcon, Icon } from './Icons';

export function Dialog({ title, children, onClose, onBack, headerActions, className = '' }: { title: string; children: ReactNode; onClose: () => void; onBack?: () => void; headerActions?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => { el?.close(); previous?.focus(); };
  }, []);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('.sheet-header > button, .sheet-header-actions button:last-child')?.focus(); }, [title]);
  return <dialog ref={ref} className={`product-dialog ${className}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
    <div className="sheet-handle" aria-hidden="true" />
    <header className="sheet-header">{onBack && <button className="icon-button" type="button" onClick={onBack} aria-label="返回上一级"><BackIcon /></button>}<div className="dialog-heading"><small>岁月有声</small><h2>{title}</h2></div><div className="sheet-header-actions">{headerActions}<button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button></div></header>
    {children}
  </dialog>;
}

import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => { el?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="product-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="sheet-header"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭">×</button></header>
    {children}
  </dialog>;
}

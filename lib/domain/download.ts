import { articleText, effectiveSegments, type Draft } from './writing';
import { externalArticleText, type ArticleSession } from './article-ai';
export function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportText(draft: Draft, session?: ArticleSession | null) {
  const title = draft.title.trim() || '未命名作品';
  const pending = draft.pendingVoice ? `\n\n【待确认的语音】\n${draft.pendingVoice}` : '';
  const editing = draft.segmentEdit ? `\n\n【尚在编辑的内容】\n${draft.segmentEdit.text}` : '';
  const body = externalArticleText(articleText(effectiveSegments(draft)), session);
  download(`${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)}.txt`, `${title}\n\n${body}${pending}${editing}`, 'text/plain;charset=utf-8');
}

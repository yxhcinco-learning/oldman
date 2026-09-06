import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Historical evidence keeps document links navigable, but its old screenshots
// and retired code paths need not exist in the current checkout.
export function localLinkTargets(source) {
  const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  return [...prose.matchAll(/\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)]
    .map(match => match[1] ?? match[2])
    .filter(target => !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(target))
    .map(target => decodeURIComponent(target.split(/[?#]/, 1)[0]))
    .filter(Boolean);
}

export function checkDocuments(root = process.cwd()) {
  const documents = ['README.md', 'AGENTS.md', 'DESIGN-SYSTEM.md', 'openspec/README.md', 'apps/miniprogram/README.md'];
  documents.push(...readdirSync(join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`));
  // Archive indexes are maintained navigation and receive full link checks.
  for (const file of ['docs/archive/phase-one/README.md', 'docs/archive/h5/README.md', 'docs/archive/h5/specs/README.md']) documents.push(file);
  const specs = readdirSync(join(root, 'openspec/specs'), { withFileTypes: true })
    .filter(item => item.isDirectory()).map(item => `openspec/specs/${item.name}/spec.md`);
  const errors = [];
  for (const file of [...documents, ...specs]) {
    errors.push(...checkDocumentLinks(root, file));
    if (!existsSync(join(root, file))) continue;
    const source = readFileSync(join(root, file), 'utf8');
    if (/^docs\/[^/]+\.md$/.test(file) && source.startsWith('# 历史资料已归档')) errors.push(`归档跳转空壳应移除并修复引用: ${file}`);
    if (specs.includes(file)) {
      const purpose = source.match(/## Purpose\s*\n([\s\S]*?)(?=\n## |$)/)?.[1].trim();
      if (!purpose || /\bTBD\b/.test(purpose)) errors.push(`规格 Purpose 未完成: ${file}`);
    }
  }
  const archives = ['docs/archive', 'openspec/changes/archive', 'archive/h5']
    .flatMap(dir => markdownFiles(root, dir)).filter(file => !documents.includes(file));
  for (const file of archives) errors.push(...checkDocumentLinks(root, file, { markdownOnly: true }));
  return { errors, documentCount: documents.length, specCount: specs.length, archiveCount: archives.length };
}

function markdownFiles(root, dir) {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(item => {
    const file = `${dir}/${item.name}`;
    if (item.isDirectory()) return markdownFiles(root, file);
    return item.isFile() && item.name.endsWith('.md') ? [file] : [];
  });
}

export function checkDocumentLinks(root, file, { markdownOnly = false } = {}) {
  if (!existsSync(join(root, file))) return [`文档不存在: ${file}`];
  return localLinkTargets(readFileSync(join(root, file), 'utf8'))
    .filter(target => !markdownOnly || /\.md$/i.test(target))
    .filter(target => !existsSync(resolve(root, dirname(file), target)))
    .map(target => `文档引用失效: ${file} -> ${target}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkDocuments();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else console.info(`文档检查通过：${result.documentCount} 份维护文档、${result.specCount} 份规格、${result.archiveCount} 份历史文档（引用与 Purpose）`);
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Maintenance documents use inline Markdown file links. Historical artifacts are
// frozen evidence: their old screenshots and code paths need not exist today.
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
  // Include archive indexes, not frozen historical evidence or old deltas.
  for (const file of ['docs/archive/phase-one/README.md', 'docs/archive/h5/README.md', 'docs/archive/h5/specs/README.md']) documents.push(file);
  const specs = readdirSync(join(root, 'openspec/specs'), { withFileTypes: true })
    .filter(item => item.isDirectory()).map(item => `openspec/specs/${item.name}/spec.md`);
  const errors = [];
  for (const file of [...documents, ...specs]) {
    if (!existsSync(join(root, file))) { errors.push(`文档不存在: ${file}`); continue; }
    const source = readFileSync(join(root, file), 'utf8');
    for (const target of localLinkTargets(source)) {
      if (!existsSync(resolve(root, dirname(file), target))) errors.push(`文档引用失效: ${file} -> ${target}`);
    }
    if (specs.includes(file)) {
      const purpose = source.match(/## Purpose\s*\n([\s\S]*?)(?=\n## |$)/)?.[1].trim();
      if (!purpose || /\bTBD\b/.test(purpose)) errors.push(`规格 Purpose 未完成: ${file}`);
    }
  }
  return { errors, documentCount: documents.length, specCount: specs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkDocuments();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else console.info(`文档检查通过：${result.documentCount} 份维护文档、${result.specCount} 份规格（本地文件引用与 Purpose）`);
}

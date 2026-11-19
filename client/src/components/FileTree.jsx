import { useMemo, useState } from 'react';

function buildTree(files) {
  const root = { children: new Map(), path: '' };
  for (const f of files) {
    let node = root;
    const parts = f.path.split('/');
    parts.forEach((part, i) => {
      if (!node.children.has(part)) node.children.set(part, { name: part, children: new Map(), path: parts.slice(0, i + 1).join('/') });
      node = node.children.get(part);
    });
    node.entry = f;
  }
  return root;
}

export default function FileTree({ files, activeId, onOpen, onCreate, onRename, onDelete }) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState(new Set());
  const [selDir, setSelDir] = useState('');

  const toggle = (p) => setCollapsed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const prefix = selDir ? selDir + '/' : '';

  const render = (node, depth) =>
    [...node.children.values()]
      .sort((a, b) => (b.entry?.type === 'dir' || b.children.size > 0) - (a.entry?.type === 'dir' || a.children.size > 0) || a.name.localeCompare(b.name))
      .map((n) => {
        const isDir = n.entry?.type === 'dir' || n.children.size > 0;
        const open = !collapsed.has(n.path);
        return (
          <div key={n.path}>
            <div
              className={`node ${!isDir && n.entry?.id === activeId ? 'active' : ''} ${isDir && selDir === n.path ? 'seldir' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => (isDir ? (toggle(n.path), setSelDir(n.path)) : onOpen(n.entry))}
            >
              <span className="name">{isDir ? (open ? '▾ 📁' : '▸ 📁') : '📄'} {n.name}</span>
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                <button title="Rename / move" onClick={() => { const p = prompt('New path', n.path); p && p !== n.path && onRename(n.entry, p); }}>✎</button>
                <button title="Delete" onClick={() => confirm(`Delete ${n.path}${isDir ? ' and its contents' : ''}?`) && onDelete(n.entry)}>🗑</button>
              </span>
            </div>
            {isDir && open && render(n, depth + 1)}
          </div>
        );
      });

  return (
    <div className="filetree">
      <div className="ft-head">
        <b>FILES</b>
        <span>
          <button title="New file" onClick={() => { const p = prompt('New file path', prefix + 'untitled.js'); p && onCreate(p, 'file'); }}>＋📄</button>
          <button title="New folder" onClick={() => { const p = prompt('New folder path', prefix + 'folder'); p && onCreate(p, 'dir'); }}>＋📁</button>
        </span>
      </div>
      <div className="ft-body" onClick={() => setSelDir('')}>{render(tree, 0)}</div>
    </div>
  );
}

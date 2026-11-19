import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { MonacoBinding } from 'y-monaco';
import { b64ToU8, colorFor } from '../util.js';

// One Yjs doc per open file; edits + cursors are relayed through the server's socket room.
export default function CodeEditor({ socket, file, user, editorRef }) {
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    if (!editor || !socket || !file) return;
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('t');
    const awareness = new Awareness(ydoc);
    awareness.setLocalStateField('user', { name: user.username, color: colorFor(user.username) });
    let binding = null;
    let disposed = false;

    const styleEl = document.createElement('style');
    document.head.appendChild(styleEl);
    const restyle = () => {
      let css = '';
      awareness.getStates().forEach((st, id) => {
        if (id === ydoc.clientID || !st.user) return;
        const { color, name } = st.user;
        css += `.yRemoteSelection-${id}{background:${color};opacity:.35}` +
          `.yRemoteSelectionHead-${id}{border-color:${color}}` +
          `.yRemoteSelectionHead-${id}::after{content:"${String(name).replace(/[^\w]/g, '')}";background:${color}}`;
      });
      styleEl.textContent = css;
    };
    awareness.on('change', restyle);

    const onDocUpdate = (update, origin) => {
      if (origin !== 'remote') socket.emit('doc:update', { fileId: file.id, update });
    };
    const onAwareness = ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return;
      socket.emit('awareness:update', {
        fileId: file.id,
        update: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]),
      });
    };
    ydoc.on('update', onDocUpdate);
    awareness.on('update', onAwareness);

    const onRemoteDoc = (m) => m.fileId === file.id && Y.applyUpdate(ydoc, new Uint8Array(m.update), 'remote');
    const onRemoteAwareness = (m) => m.fileId === file.id && applyAwarenessUpdate(awareness, new Uint8Array(m.update), 'remote');
    const onQuery = (m) => {
      if (m.fileId === file.id)
        socket.emit('awareness:update', { fileId: file.id, update: encodeAwarenessUpdate(awareness, [ydoc.clientID]) });
    };
    socket.on('doc:update', onRemoteDoc);
    socket.on('awareness:update', onRemoteAwareness);
    socket.on('awareness:query', onQuery);

    // (Re)open on mount and on every reconnect; Yjs merges any offline edits automatically.
    const open = () => socket.emit('doc:open', { fileId: file.id }, (res) => {
      if (disposed || !res || res.error) return;
      Y.applyUpdate(ydoc, b64ToU8(res.state), 'remote');
      if (!binding) binding = new MonacoBinding(ytext, editor.getModel(), new Set([editor]), awareness);
      socket.emit('doc:update', { fileId: file.id, update: Y.encodeStateAsUpdate(ydoc) });
    });
    open();
    socket.on('connect', open);

    return () => {
      disposed = true;
      socket.off('connect', open);
      socket.off('doc:update', onRemoteDoc);
      socket.off('awareness:update', onRemoteAwareness);
      socket.off('awareness:query', onQuery);
      removeAwarenessStates(awareness, [ydoc.clientID], 'local');
      socket.emit('doc:close', { fileId: file.id });
      binding?.destroy();
      awareness.destroy();
      ydoc.destroy();
      styleEl.remove();
    };
  }, [editor, socket, file?.id, user.username]);

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      path={file ? `inmemory://model/${file.id}/${file.path}` : undefined}
      onMount={(ed) => { editorRef.current = ed; setEditor(ed); }}
      options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2, padding: { top: 8 } }}
    />
  );
}

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wall', {
  readState: () => ipcRenderer.invoke('state:read'),
  writeState: (v) => ipcRenderer.invoke('state:write', v),
  exportPage: (html, name) => ipcRenderer.invoke('page:export', html, name),
  preview: (html) => ipcRenderer.invoke('page:preview', html),
  stream: (id, provider, system, user, key, opts) => ipcRenderer.invoke('model:stream', id, provider, system, user, key, opts),
  image: (provider, prompt, key) => ipcRenderer.invoke('model:image', provider, prompt, key),
  onDelta: (fn) => {
    const handler = (_e, id, delta) => fn(id, delta)
    ipcRenderer.on('model:delta', handler)
    return () => ipcRenderer.off('model:delta', handler)
  },
})

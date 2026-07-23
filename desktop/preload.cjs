const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('naeilSpecialDesktop', {
  downloadImage: (url) => ipcRenderer.invoke('naeil-special:download-image', url),
  saveProjectFile: (payload) => ipcRenderer.invoke('naeil-special:save-project-file', payload),
  requestClose: () => ipcRenderer.send('naeil-special:request-close'),
  onSaveBeforeClose: (callback) => {
    const listener = (_event, mode) => callback(mode)
    ipcRenderer.on('naeil-special:save-before-close', listener)
    return () => ipcRenderer.removeListener('naeil-special:save-before-close', listener)
  },
  completeSaveBeforeClose: (saved) => ipcRenderer.send('naeil-special:save-before-close-complete', saved),
})

const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('naeilSpecialDesktop', {
  downloadImage: (url) => ipcRenderer.invoke('naeil-special:download-image', url),
  lookupGettyContent: (contentId) => ipcRenderer.invoke('naeil-special:lookup-getty-content', contentId),
  saveProjectFile: (payload) => ipcRenderer.invoke('naeil-special:save-project-file', payload),
  readProjectFile: (filePath) => ipcRenderer.invoke('naeil-special:read-project-file', filePath),
  getFilePath: (file) => webUtils.getPathForFile(file),
  requestClose: () => ipcRenderer.send('naeil-special:request-close'),
  onCliRequest: (callback) => {
    const listener = (_event, request) => callback(request)
    ipcRenderer.on('naeil-special:cli-request', listener)
    return () => ipcRenderer.removeListener('naeil-special:cli-request', listener)
  },
  completeCliRequest: (id, response) => ipcRenderer.send('naeil-special:cli-response', id, response),
  onSaveBeforeClose: (callback) => {
    const listener = (_event, mode) => callback(mode)
    ipcRenderer.on('naeil-special:save-before-close', listener)
    return () => ipcRenderer.removeListener('naeil-special:save-before-close', listener)
  },
  completeSaveBeforeClose: (saved) => ipcRenderer.send('naeil-special:save-before-close-complete', saved),
})

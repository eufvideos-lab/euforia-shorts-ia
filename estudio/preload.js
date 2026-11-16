// Ponte entre a tela (editor) e o PC: só o que o editor precisa, nada de acesso livre ao disco.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('estudio', {
  info: () => ipcRenderer.invoke('estudio:info'),
  listar: () => ipcRenderer.invoke('estudio:listar'),
  escolherPasta: () => ipcRenderer.invoke('estudio:escolherPasta'),
  renderizar: (pedido) => ipcRenderer.invoke('estudio:renderizar', pedido),
  cancelar: () => ipcRenderer.invoke('estudio:cancelar'),
  mostrar: (arq) => ipcRenderer.invoke('estudio:mostrar', arq),
  abrir: (arq) => ipcRenderer.invoke('estudio:abrir', arq),
  atualizacao: () => ipcRenderer.invoke('estudio:atualizacao'),
  atualizar: (instalador) => ipcRenderer.invoke('estudio:atualizar', instalador),
  novidades: () => ipcRenderer.invoke('estudio:novidades'),
  aoBaixar: (cb) => {
    const f = (_e, x) => cb(x);
    ipcRenderer.on('estudio:baixando', f);
    return () => ipcRenderer.removeListener('estudio:baixando', f);
  },
  aoProgresso: (cb) => {
    const f = (_e, x) => cb(x);
    ipcRenderer.on('estudio:progresso', f);
    return () => ipcRenderer.removeListener('estudio:progresso', f);
  },
});

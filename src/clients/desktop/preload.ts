import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from './contracts';

// No se expone ipcRenderer ni un canal arbitrario al documento.
contextBridge.exposeInMainWorld('moscas', Object.freeze({
  brain: () => ipcRenderer.invoke('desktop:brain'),
  state: () => ipcRenderer.invoke('desktop:state'),
  saveToken: (token: string) => ipcRenderer.invoke('desktop:saveToken', token),
  start: (token?: string) => ipcRenderer.invoke('desktop:start', token),
  stop: () => ipcRenderer.invoke('desktop:stop'),
  forget: () => ipcRenderer.invoke('desktop:forget'),
  login: (enabled: boolean) => ipcRenderer.invoke('desktop:login', enabled),
  website: () => ipcRenderer.invoke('desktop:website'),
  hide: () => ipcRenderer.invoke('desktop:hide'),
  quit: () => ipcRenderer.invoke('desktop:quit'),
} satisfies DesktopAPI));

import { contextBridge, ipcRenderer } from 'electron'

declare global {
  interface Window {
    App: typeof API
  }
}

const API = {
  sayHelloFromBridge: () => console.log('\nHello from bridgeAPI! 👋\n\n'),
  username: process.env.USER,
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  addRecentProject: (project: { name: string; path: string }) =>
    ipcRenderer.invoke('add-recent-project', project),
  isGitRepository: (path: string) =>
    ipcRenderer.invoke('is-git-repository', path),
  getGitBranches: (path: string) =>
    ipcRenderer.invoke('get-git-branches', path),
  cloneRepository: (repoUrl: string) =>
    ipcRenderer.invoke('clone-repository', repoUrl),
}

contextBridge.exposeInMainWorld('App', API)

/* La lib DOM di TypeScript non porta ancora la File System Access API
   (showDirectoryPicker e affini) — è lo stesso motivo per cui `webkitdirectory`
   va dichiarato a mano altrove. Qui il minimo indispensabile per il vault di
   Obsidian: aprire una cartella, tenerne il permesso, leggerne i file .md. */

interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<'granted' | 'denied' | 'prompt'>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

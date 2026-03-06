import './app.css';
import SoundtrackEditor from './SoundtrackEditor.svelte';

const { ipcRenderer } = require('electron');

const app = new SoundtrackEditor({
  target: document.getElementById('app'),
  props: {
    onClose: async () => {
      // Close the window via IPC
      try {
        await ipcRenderer.invoke('close-editor-window');
      } catch (err) {
        console.error('Error closing editor window:', err);
      }
    },
    onSave: () => {
      // Notify main window to refresh
      ipcRenderer.send('soundtrack-saved');
    }
  }
});

export default app;

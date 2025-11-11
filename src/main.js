import './app.css';
import App from './App.svelte';
import './player.js';

const app = new App({
  target: document.getElementById('app'),
});

export default app;


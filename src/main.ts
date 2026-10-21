import './style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (canvas) {
  const game = new Game(canvas);
  // Dev-only handle for console debugging and browser checks.
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
} else {
  console.error('Canvas element not found!');
}

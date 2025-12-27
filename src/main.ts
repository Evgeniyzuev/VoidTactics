import './style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (canvas) {
  new Game(canvas);
} else {
  console.error('Canvas element not found!');
}

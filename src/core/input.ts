import { clamp } from './math';
import type { GameSettings } from './save';

export type InputAction = 'pause' | 'mute' | 'debug' | 'stress' | 'ability' | 'secondaryAbility';
type TouchSettings = Pick<GameSettings, 'touchMode' | 'touchSensitivity' | 'touchOffset'>;

export class Input {
  x = window.innerWidth * 0.5;
  y = window.innerHeight * 0.82;
  left = false;
  right = false;
  pointerActive = false;
  readonly keys = new Set<string>();
  onAction: ((action: InputAction) => void) | undefined;
  onBlur: (() => void) | undefined;
  private touchId?: number;
  private touchX = 0;
  private touchY = 0;
  private touchOffsetPending = true;

  constructor(private readonly host: HTMLElement, private settings: TouchSettings) {
    host.addEventListener('pointermove', this.handlePointerMove);
    host.addEventListener('pointerdown', this.handlePointerDown);
    host.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    window.addEventListener('mouseup', this.handleMouseUp);
    host.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  setSettings(settings: TouchSettings): void {
    if (settings.touchMode !== this.settings.touchMode || settings.touchOffset !== this.settings.touchOffset) this.touchOffsetPending = true;
    this.settings = settings;
  }

  releaseWeapons(): void {
    this.left = false;
    this.right = false;
    this.releaseTouch();
  }

  resetTouch(): void {
    this.touchOffsetPending = true;
    this.releaseWeapons();
  }

  private releaseTouch(): void {
    if (this.touchId !== undefined && this.host.hasPointerCapture(this.touchId)) this.host.releasePointerCapture(this.touchId);
    this.touchId = undefined;
  }

  private moveAbsolute(event: PointerEvent): void {
    const bounds = this.host.getBoundingClientRect();
    this.x = event.clientX - bounds.left;
    this.y = event.clientY - bounds.top;
    this.pointerActive = true;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      if (this.settings.touchMode === 'relative') {
        if (event.pointerId !== this.touchId) return;
        const bounds = this.host.getBoundingClientRect();
        this.x = clamp(this.x + (event.clientX - this.touchX) * this.settings.touchSensitivity, 28, bounds.width - 28);
        this.y = clamp(this.y + (event.clientY - this.touchY) * this.settings.touchSensitivity, 72, bounds.height - 32);
        this.touchX = event.clientX;
        this.touchY = event.clientY;
        this.pointerActive = true;
      } else {
        this.moveAbsolute(event);
      }
      return;
    }
    this.moveAbsolute(event);
    if (event.pointerType === 'mouse') this.updateButtons(event.buttons);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      if (this.touchId !== undefined) return;
      this.touchId = event.pointerId;
      if (this.settings.touchMode === 'relative') {
        const bounds = this.host.getBoundingClientRect();
        this.x = clamp(this.x, 28, bounds.width - 28);
        if (this.touchOffsetPending) {
          this.y = clamp(this.y - this.settings.touchOffset, 72, bounds.height - 32);
          this.touchOffsetPending = false;
        }
        this.touchX = event.clientX;
        this.touchY = event.clientY;
      } else {
        this.moveAbsolute(event);
      }
      this.left = true;
      this.pointerActive = true;
      this.host.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    this.handlePointerMove(event);
    if (event.button === 2) event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      if (event.pointerId !== this.touchId) return;
      this.releaseTouch();
      this.left = false;
      return;
    }
    this.updateButtons(event.buttons);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    this.updateButtons(event.buttons);
    if (event.button === 2) event.preventDefault();
    if (event.button === 1) {
      event.preventDefault();
      this.onAction?.('ability');
    }
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.updateButtons(event.buttons);
  };

  private updateButtons(buttons: number): void {
    this.left = (buttons & 1) !== 0;
    this.right = (buttons & 2) !== 0;
  }

  private readonly handleContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
    if (event.repeat) return;
    const actions: Partial<Record<string, InputAction>> = {
      Escape: 'pause',
      KeyP: 'pause',
      KeyM: 'mute',
      KeyQ: 'ability',
      KeyE: 'secondaryAbility',
      F3: 'debug',
      F8: 'stress',
    };
    const action = actions[event.code];
    if (action) {
      event.preventDefault();
      this.onAction?.(action);
    }
    if (event.code === 'Space') event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.keys.clear();
    this.releaseWeapons();
    this.onBlur?.();
  };
}

export type InputAction = 'pause' | 'mute' | 'debug' | 'stress' | 'ability' | 'secondaryAbility';

export class Input {
  x = window.innerWidth * 0.5;
  y = window.innerHeight * 0.82;
  left = false;
  right = false;
  pointerActive = false;
  readonly keys = new Set<string>();
  onAction: ((action: InputAction) => void) | undefined;
  onBlur: (() => void) | undefined;

  constructor(private readonly host: HTMLElement) {
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

  releaseWeapons(): void {
    this.left = false;
    this.right = false;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const bounds = this.host.getBoundingClientRect();
    this.x = event.clientX - bounds.left;
    this.y = event.clientY - bounds.top;
    this.pointerActive = true;
    if (event.pointerType === 'mouse') this.updateButtons(event.buttons);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.handlePointerMove(event);
    if (event.button === 2) event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
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

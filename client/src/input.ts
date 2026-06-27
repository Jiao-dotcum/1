/** Keyboard input: WASD/arrows for movement, E for sit/stand (edge-triggered). */
export class Input {
  private keys = new Set<string>();
  /** Set true on the frame E is pressed; consumed by the game loop. */
  sitPressed = false;

  constructor() {
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      // Ignore typing into inputs.
      if (e.target instanceof HTMLInputElement) return;
      if (k === "e" && !this.keys.has("e")) this.sitPressed = true;
      this.keys.add(k);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => this.keys.clear());
  }

  /** Movement vector in world space: x (east), z (south). Normalized-ish. */
  moveVector(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) z -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) z += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  consumeSit(): boolean {
    const v = this.sitPressed;
    this.sitPressed = false;
    return v;
  }
}

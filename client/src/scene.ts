import * as THREE from "three";
import { FLOOR_HALF, TABLE } from "@pokerpandey/shared";

export interface TableInfo {
  id: string;
  x: number;
  z: number;
}

interface Avatar {
  group: THREE.Group;
  body: THREE.Mesh;
  target: THREE.Vector3;
  isLocal: boolean;
}

/** Three.js rendering of the casino floor, tables, and capsule avatars. */
export class Scene3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private avatars = new Map<string, Avatar>();
  private tableMeshes = new Map<string, THREE.Group>();
  private localId = "";
  private localPos = new THREE.Vector3(0, 0, FLOOR_HALF - 3);
  private localHeading = Math.PI;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 25, 55);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
    this.camera.position.set(0, 8, FLOOR_HALF + 4);

    this.buildEnvironment();

    addEventListener("resize", () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  private buildEnvironment(): void {
    // Lights.
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x202830, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(10, 20, 8);
    this.scene.add(key);

    // Floor.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FLOOR_HALF * 2, FLOOR_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x16314a, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Grid for spatial reference.
    const grid = new THREE.GridHelper(FLOOR_HALF * 2, FLOOR_HALF * 2, 0x2a4d6e, 0x1c3147);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);

    // Walls (visual boundary).
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0e1a28, side: THREE.DoubleSide });
    const wallGeo = new THREE.BoxGeometry(FLOOR_HALF * 2, 4, 0.4);
    const positions: [number, number, number, number][] = [
      [0, -FLOOR_HALF, 0, 0],
      [0, FLOOR_HALF, 0, 0],
      [-FLOOR_HALF, 0, Math.PI / 2, 0],
      [FLOOR_HALF, 0, Math.PI / 2, 0],
    ];
    for (const [x, z, ry] of positions) {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.set(x, 2, z);
      w.rotation.y = ry;
      this.scene.add(w);
    }
  }

  setLocalId(id: string): void {
    this.localId = id;
  }

  /** Build table meshes + seat markers from the synced table list (once). */
  syncTables(tables: TableInfo[]): void {
    for (const t of tables) {
      if (this.tableMeshes.has(t.id)) continue;
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);

      const felt = new THREE.Mesh(
        new THREE.CylinderGeometry(TABLE.radius, TABLE.radius, 0.25, 32),
        new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: 0.8 }),
      );
      felt.position.y = 0.75;
      g.add(felt);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(TABLE.radius, 0.12, 12, 32),
        new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.6 }),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.88;
      g.add(rim);

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.5, 0.75, 16),
        new THREE.MeshStandardMaterial({ color: 0x222a38 }),
      );
      pedestal.position.y = 0.37;
      g.add(pedestal);

      // Seat markers around the table.
      for (let i = 0; i < TABLE.seats; i++) {
        const a = (i / TABLE.seats) * Math.PI * 2;
        const marker = new THREE.Mesh(
          new THREE.CircleGeometry(0.45, 20),
          new THREE.MeshStandardMaterial({ color: 0x274060, transparent: true, opacity: 0.7 }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(Math.cos(a) * TABLE.seatRadius, 0.02, Math.sin(a) * TABLE.seatRadius);
        g.add(marker);
      }

      this.scene.add(g);
      this.tableMeshes.set(t.id, g);
    }
  }

  /**
   * Reconcile avatars with the synced player map.
   * `players` is the colyseus MapSchema (iterated generically).
   */
  syncPlayers(players: Map<string, any>): void {
    const seen = new Set<string>();
    players.forEach((p: any, id: string) => {
      seen.add(id);
      let av = this.avatars.get(id);
      if (!av) av = this.spawnAvatar(id, p.name, id === this.localId);
      // Local player is driven by prediction; remotes interpolate to server pos.
      if (!av.isLocal) {
        av.target.set(p.x, 0, p.z);
        av.group.rotation.y = this.headingToY(p.heading);
      }
    });
    // Remove avatars that left.
    for (const [id, av] of this.avatars) {
      if (!seen.has(id)) {
        this.scene.remove(av.group);
        this.avatars.delete(id);
      }
    }
  }

  // TODO(phase4): replace capsule avatars with rigged models and tween
  // sit/stand + dealing/chip animations (see docs/PHASE4.md).
  private spawnAvatar(id: string, name: string, isLocal: boolean): Avatar {
    const group = new THREE.Group();
    const color = isLocal ? 0x2dd4a7 : this.colorFor(id);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    body.position.y = 1.0;
    group.add(body);

    // Simple "face" dot so heading is visible.
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x0b0e14 }),
    );
    nose.position.set(0, 1.15, 0.35);
    group.add(nose);

    group.add(this.makeNameplate(name, isLocal));

    this.scene.add(group);
    const av: Avatar = { group, body, target: new THREE.Vector3(), isLocal };
    this.avatars.set(id, av);
    return av;
  }

  private makeNameplate(name: string, isLocal: boolean): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = isLocal ? "#2dd4a7" : "#e6e9ef";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 14), 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(2.4, 0.6, 1);
    sprite.position.y = 2.2;
    return sprite;
  }

  private colorFor(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
    const hue = (h % 360) / 360;
    return new THREE.Color().setHSL(hue, 0.55, 0.6).getHex();
  }

  private headingToY(heading: number): number {
    // World forward for heading h is (cos h, 0, sin h); convert to mesh Y-rotation.
    return -heading + Math.PI / 2;
  }

  /** Drive the local avatar directly from predicted state. */
  setLocalPlayer(pos: THREE.Vector3, heading: number): void {
    this.localPos.copy(pos);
    this.localHeading = heading;
    const av = this.avatars.get(this.localId);
    if (av) {
      av.group.position.copy(pos);
      av.group.rotation.y = this.headingToY(heading);
    }
  }

  /** Per-frame interpolation + camera follow. */
  update(dt: number): void {
    for (const [id, av] of this.avatars) {
      if (av.isLocal || id === this.localId) continue;
      av.group.position.lerp(av.target, Math.min(1, dt * 10));
    }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(): void {
    const forward = new THREE.Vector3(Math.cos(this.localHeading), 0, Math.sin(this.localHeading));
    const camPos = this.localPos
      .clone()
      .addScaledVector(forward, -7)
      .add(new THREE.Vector3(0, 6, 0));
    this.camera.position.lerp(camPos, 0.12);
    this.camera.lookAt(this.localPos.x, 1.2, this.localPos.z);
  }

  /** World positions of all avatars (for spatial voice). */
  avatarPositions(): Map<string, THREE.Vector3> {
    const out = new Map<string, THREE.Vector3>();
    for (const [id, av] of this.avatars) out.set(id, av.group.position.clone());
    return out;
  }

  listener(): { pos: THREE.Vector3; forward: THREE.Vector3 } {
    return {
      pos: this.localPos.clone(),
      forward: new THREE.Vector3(Math.cos(this.localHeading), 0, Math.sin(this.localHeading)),
    };
  }

  /** Nearest table to a world position, with distance. */
  nearestTable(tables: TableInfo[], pos: THREE.Vector3): { table: TableInfo; dist: number } | null {
    let best: { table: TableInfo; dist: number } | null = null;
    for (const t of tables) {
      const d = Math.hypot(pos.x - t.x, pos.z - t.z);
      if (!best || d < best.dist) best = { table: t, dist: d };
    }
    return best;
  }
}

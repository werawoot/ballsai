// The 3D scene behind every drill picture on /training: a faceless training mannequin
// (no face, no real person: the users are minors) on a pitch, with cones, ball, wall and
// ground arrows. Rendered once, offline, by render.mjs; the app ships the images only.
import * as THREE from '/node_modules/three/build/three.module.js'

// A faceless training mannequin: brand red top, ink shorts, neutral skin. Joint angles in degrees.
export function render(canvas, spec) {
  const W = spec.w ?? 800, H = spec.h ?? 600
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H, false); renderer.setPixelRatio(1)
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(spec.bg ?? '#eef0ea')
  scene.fog = new THREE.Fog(spec.bg ?? '#eef0ea', 9, 22)
  const cam = new THREE.PerspectiveCamera(spec.fov ?? 32, W / H, 0.1, 100)
  const [cx, cy, cz] = spec.cam ?? [4.2, 2.6, 5.2]; cam.position.set(cx, cy, cz)
  const [tx, ty, tz] = spec.target ?? [0, 0.8, 0]; cam.lookAt(tx, ty, tz)

  scene.add(new THREE.HemisphereLight('#ffffff', '#7a8a6a', 1.1))
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4); sun.position.set(4, 8, 3); sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -5; sun.shadow.camera.right = 5; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5; sun.shadow.radius = 4
  scene.add(sun)
  const rim = new THREE.DirectionalLight('#ffd0d0', 0.8); rim.position.set(-5, 3, -4); scene.add(rim)

  // Pitch: grass with mowing stripes and a white line.
  const grassC = document.createElement('canvas'); grassC.width = 512; grassC.height = 512
  const g = grassC.getContext('2d')
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4f8f3a' : '#57993f'; g.fillRect(0, i * 64, 512, 64) }
  const tex = new THREE.CanvasTexture(grassC); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3); tex.colorSpace = THREE.SRGBColorSpace
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
  if (spec.line !== false) { const line = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.08), new THREE.MeshStandardMaterial({ color: '#f4f4ee' })); line.rotation.x = -Math.PI / 2; line.position.set(0, 0.002, -1.6); scene.add(line) }

  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 })
  const skin = mat('#c9b6a4'), shirt = mat('#CC0001'), shorts = mat('#141a24'), sock = mat('#f2f2f2'), boot = mat('#111111')
  const cap = (r, len, m) => { const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 16), m); mesh.castShadow = true; mesh.position.y = -len / 2 - r * 0.2; return mesh }
  const d = a => THREE.MathUtils.degToRad(a ?? 0)
  const P = spec.pose ?? {}

  // Rig: root at pelvis.
  const root = new THREE.Group(); root.position.set(...(P.root ?? [0, 0.98, 0])); root.rotation.set(d(P.rootX), d(P.rootY), d(P.rootZ)); scene.add(root)
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.14, 8, 16), shorts); pelvis.rotation.z = Math.PI / 2; pelvis.castShadow = true; root.add(pelvis)
  const torso = new THREE.Group(); torso.rotation.set(d(P.torsoX), d(P.torsoY), d(P.torsoZ)); root.add(torso)
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.36, 8, 16), shirt); chest.position.y = 0.3; chest.castShadow = true; torso.add(chest)
  const neck = new THREE.Group(); neck.position.y = 0.6; neck.rotation.set(d(P.headX), d(P.headY), 0); torso.add(neck)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), skin); head.position.y = 0.14; head.scale.set(1, 1.12, 1); head.castShadow = true; neck.add(head)
  const limb = (parent, pos, a, upperLen, lowerLen, r, upperMat, lowerMat, endMat, bend, hand) => {
    const upper = new THREE.Group(); upper.position.set(...pos); upper.rotation.set(d(a[0]), d(a[1]), d(a[2])); parent.add(upper)
    upper.add(cap(r, upperLen, upperMat))
    const lower = new THREE.Group(); lower.position.y = -upperLen - r * 0.4; lower.rotation.x = d(bend); upper.add(lower)
    lower.add(cap(r * 0.85, lowerLen, lowerMat))
    if (endMat) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 12), endMat); e.rotation.x = Math.PI / 2; e.position.set(0, -lowerLen - r * 1.1, 0.07); e.castShadow = true; lower.add(e) }
    if (hand) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), hand); h.position.y = -lowerLen - r * 1.2; h.castShadow = true; lower.add(h) }
    return upper
  }
  limb(torso, [0.25, 0.52, 0], P.lArm ?? [0, 0, 12], 0.24, 0.22, 0.055, shirt, skin, null, P.lElbow ?? -10, skin)
  limb(torso, [-0.25, 0.52, 0], P.rArm ?? [0, 0, -12], 0.24, 0.22, 0.055, shirt, skin, null, P.rElbow ?? -10, skin)
  limb(root, [0.1, -0.05, 0], P.lLeg ?? [0, 0, 2], 0.36, 0.38, 0.075, shorts, sock, boot, P.lKnee ?? 0)
  limb(root, [-0.1, -0.05, 0], P.rLeg ?? [0, 0, -2], 0.36, 0.38, 0.075, shorts, sock, boot, P.rKnee ?? 0)

  // Arrows on the ground show the movement path.
  for (const pts of spec.paths ?? []) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.02, z)))
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.025, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35 }))
    scene.add(tube)
    const end = curve.getPoint(1), before = curve.getPoint(0.96)
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 16), tube.material)
    head.position.copy(end); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(before).normalize()); scene.add(head)
  }
  // Props
  const cone = (x, z) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 24), mat('#ff7a00')); c.position.set(x, 0.13, z); c.castShadow = true; scene.add(c) }
  for (const [x, z] of spec.cones ?? []) cone(x, z)
  if (spec.wall) { const w = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.2), mat('#d8d2c6')); w.position.set(...spec.wall); w.castShadow = true; w.receiveShadow = true; scene.add(w) }
  for (const [x, y, z] of spec.balls ?? []) {
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 128; const b = bc.getContext('2d'); b.fillStyle = '#f7f7f7'; b.fillRect(0, 0, 256, 128); b.fillStyle = '#151515'
    for (let i = 0; i < 6; i++) { b.beginPath(); b.arc(20 + i * 44, i % 2 ? 40 : 88, 14, 0, Math.PI * 2); b.fill() }
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 32), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.4 })); ball.position.set(x, y ?? 0.11, z); ball.castShadow = true; scene.add(ball)
  }
  renderer.render(scene, cam)
}

// One 3D scene per drill. Character faces +z; side views turn the root 90°.
const F = { cam: [2.5, 1.45, 3.3], target: [0, 0.72, 0.15], fov: 34 }            // front three-quarter
const S = { cam: [0.6, 1.3, 4.2], target: [0.4, 0.6, 0], fov: 34 }          // side view
const Low = { cam: [2.4, 1.2, 2.6], target: [0, 0.32, 0.3], fov: 34 }           // ground work
const jog = { torsoX: 8, lLeg: [-35, 0, 2], lKnee: 25, rLeg: [25, 0, -2], rKnee: 75, lArm: [35, 0, 8], lElbow: -85, rArm: [-40, 0, -8], rElbow: -85 }
const sprint = { root: [0, 0.94, 0], torsoX: 18, lLeg: [-60, 0, 2], lKnee: 55, rLeg: [32, 0, -2], rKnee: 100, lArm: [55, 0, 8], lElbow: -90, rArm: [-65, 0, -8], rElbow: -90 }
const squat = { root: [0, 0.62, 0], torsoX: 28, lLeg: [-80, 0, 8], rLeg: [-80, 0, -8], lKnee: 95, rKnee: 95, lArm: [-80, 0, 10], rArm: [-80, 0, -10], lElbow: 0, rElbow: 0 }
const lunge = { root: [0, 0.6, 0], lLeg: [-82, 0, 3], lKnee: 88, rLeg: [28, 0, -3], rKnee: 100, lArm: [0, 0, 28], rArm: [0, 0, -28], lElbow: -70, rElbow: -70 }
const kick = { rootY: 90, torsoX: -8, lLeg: [6, 0, 3], lKnee: 18, rLeg: [-62, 0, -4], rKnee: 8, lArm: [-10, 0, 55], rArm: [20, 0, -45], lElbow: -20, rElbow: -20 }

export const SCENES = {
  // A — U10 Foundation
  'a1-react-jog': { ...F, pose: jog, paths: [[[-0.3, 0.6], [0.4, 0.9], [1.3, 0.5]]], cones: [[1.5, 0.4], [-1.2, -0.5]] },
  'a2-skater-hops': { ...F, pose: { root: [0, 0.88, 0], torsoX: 22, torsoZ: -10, lLeg: [-22, 0, 2], lKnee: 38, rLeg: [24, 0, -28], rKnee: 70, lArm: [-35, 0, 45], rArm: [35, 0, -25], lElbow: -20, rElbow: -20 }, paths: [[[-0.9, 0.3], [0, 0.6], [0.9, 0.3]]] },
  'a3-single-leg-ball': { ...F, pose: { lLeg: [0, 0, 1], rLeg: [-45, 0, -3], rKnee: 75, lArm: [-62, 0, 16], rArm: [-62, 0, -16], lElbow: -25, rElbow: -25 }, balls: [[0, 1.02, 0.5]] },
  'a4-pushup-ball': { ...Low, pose: { root: [0, 0.46, 0], rootX: 72, lArm: [-78, 0, 8], rArm: [-78, 0, -8], lElbow: 0, rElbow: 0, lLeg: [0, 0, 2], rLeg: [0, 0, -2] }, balls: [[0.25, 0.11, 0.95]] },
  'a5-single-leg-hops': { ...F, target: [0, 0.95, 0.15], pose: { root: [0, 1.12, 0], torsoX: 12, lLeg: [-30, 0, 2], lKnee: 55, rLeg: [25, 0, -2], rKnee: 95, lArm: [-55, 0, 10], rArm: [-55, 0, -10], lElbow: -40, rElbow: -40 }, paths: [[[0.1, -0.3], [0.1, 0.5], [0.1, 1.3]]] },
  'a6-spider-crawl': { ...Low, pose: { root: [0, 0.48, 0], rootX: 78, lArm: [-82, 0, 30], rArm: [-70, 0, -30], lElbow: 0, rElbow: 0, lLeg: [-75, 0, 25], lKnee: 95, rLeg: [5, 0, -15], rKnee: 40 } },
  'a7-falling': { ...F, pose: { root: [0, 0.5, 0], rootZ: 32, torsoZ: 20, torsoX: 10, lLeg: [0, 0, 6], lKnee: 90, rLeg: [0, 0, -6], rKnee: 90, lArm: [-60, 0, 40], rArm: [-60, 0, -10], lElbow: -40, rElbow: -40 }, paths: [[[0.5, 0.1], [1.2, 0.1]]] },
  // B — U10 Ball mastery
  'b1-sole-rolls': { ...F, pose: { lLeg: [0, 0, 2], rLeg: [-24, 0, -6], rKnee: 22, lArm: [0, 0, 22], rArm: [0, 0, -22], lElbow: -20, rElbow: -20, torsoX: 6 }, balls: [[-0.12, 0.11, 0.42]] },
  'b2-cone-gates': { ...F, pose: { ...jog, torsoX: 16 }, balls: [[0.05, 0.11, 0.62]], cones: [[-0.5, 1.6], [0.5, 1.6], [-0.5, 2.8], [0.5, 2.8]], paths: [[[0, 0.8], [0, 1.6], [0, 2.8]]] },
  'b3-wall-pass': { ...S, pose: kick, wall: [3.2, 0.7, 0], balls: [[1.6, 0.11, 0]], paths: [[[0.9, 0.25], [3.0, 0.25]]], target: [1.2, 0.6, 0], cam: [0.9, 1.4, 4.7], fov: 38 },
  'b4-fake-and-go': { ...F, pose: { root: [0, 0.9, 0], torsoZ: 14, lLeg: [-15, 0, 32], lKnee: 42, rLeg: [6, 0, -5], rKnee: 18, lArm: [0, 0, 45], rArm: [0, 0, -30], lElbow: -20, rElbow: -20 }, balls: [[0.2, 0.11, 0.5]], cones: [[0, 1.6]], paths: [[[0.3, 0.7], [0.9, 1.3], [0.4, 2.4]]] },
  'b5-reaction-start': { ...S, pose: { rootY: 90, root: [0, 0.72, 0], torsoX: 45, lLeg: [-85, 0, 3], lKnee: 105, rLeg: [22, 0, -3], rKnee: 65, lArm: [40, 0, 8], rArm: [-50, 0, -8], lElbow: -60, rElbow: -60 }, paths: [[[0.6, 0.3], [2.6, 0.3]]] },
  'b6-zigzag': { ...F, pose: sprint, cones: [[-0.4, 1.2], [0.4, 2.2], [-0.4, 3.2]], paths: [[[0, 0.4], [-0.25, 1.2], [0.3, 2.2], [-0.3, 3.2]]] },
  'b7-low-hops': { ...F, pose: { root: [0, 1.06, 0], torsoX: 10, lLeg: [-22, 0, 4], rLeg: [-22, 0, -4], lKnee: 42, rKnee: 42, lArm: [30, 0, 10], rArm: [30, 0, -10], lElbow: -30, rElbow: -30 } },
  'b8-juggling': { ...F, pose: { lLeg: [0, 0, 2], rLeg: [-82, 0, -4], rKnee: 70, lArm: [0, 0, 40], rArm: [0, 0, -40], lElbow: -20, rElbow: -20, headX: 25 }, balls: [[-0.1, 1.05, 0.4]] },
  'b9-small-game': { ...F, pose: { ...jog, torsoX: 14 }, balls: [[0.1, 0.11, 0.6]], cones: [[-1.3, 2.4], [-0.5, 2.4], [1.3, -1.5], [0.5, -1.5]] },
  // C — U14 Prevention
  'c1-jog': { ...F, pose: jog, paths: [[[-0.3, 0.6], [0.6, 0.9], [1.5, 0.8]]] },
  'c2-hip-out-in': { ...F, pose: { lLeg: [0, 0, 1], rLeg: [-70, 0, -48], rKnee: 90, lArm: [0, 0, 30], rArm: [0, 0, -30], lElbow: -40, rElbow: -40 } },
  'c3-forward-back': { ...F, pose: { ...sprint, root: [0, 0.96, 0], torsoX: 12 }, paths: [[[0.15, 0.3], [0.15, 1.8]], [[-0.15, 1.8], [-0.15, 0.3]]] },
  'c4-plank': { ...Low, pose: { root: [0, 0.3, 0], rootX: 88, lArm: [-92, 0, 6], rArm: [-92, 0, -6], lElbow: 90, rElbow: 90, lLeg: [0, 0, 2], rLeg: [0, 0, -2] } },
  'c5-side-plank': { cam: [0.4, 1.3, 4.4], target: [0, 0.4, 0], pose: { root: [0, 0.48, 0], rootZ: 72, lArm: [0, 0, -20], lElbow: -90, rArm: [0, 0, -150], rElbow: 0, lLeg: [0, 0, 2], rLeg: [0, 0, -2] } },
  'c6-single-leg-balance': { ...F, pose: { lLeg: [0, 0, 1], lKnee: 12, rLeg: [-30, 0, -3], rKnee: 80, lArm: [-55, 0, 14], rArm: [-55, 0, -14], lElbow: -30, rElbow: -30, torsoX: 8 }, balls: [[0, 0.98, 0.45]] },
  'c7-squat-heel': { ...F, pose: squat },
  'c8-vertical-jump': { ...F, target: [0, 1.15, 0.15], cam: [3.0, 1.5, 4.3], fov: 38, pose: { root: [0, 1.32, 0], lLeg: [-10, 0, 4], rLeg: [-10, 0, -4], lKnee: 18, rKnee: 18, lArm: [-165, 0, 12], rArm: [-165, 0, -12], lElbow: -10, rElbow: -10 } },
  'c9-runs': { ...F, pose: sprint, paths: [[[-0.2, 0.5], [0.8, 1.0], [1.8, 1.2]]] },
  'c10-bounding': { ...S, target: [0.4, 0.9, 0], pose: { rootY: 90, root: [0, 1.12, 0], torsoX: 12, lLeg: [-72, 0, 3], lKnee: 55, rLeg: [42, 0, -3], rKnee: 50, lArm: [55, 0, 8], rArm: [-70, 0, -8], lElbow: -80, rElbow: -80 } },
  'c11-plant-cut': { ...F, pose: { root: [0, 0.9, 0], rootZ: -14, torsoZ: 16, lLeg: [-12, 0, 34], lKnee: 34, rLeg: [32, 0, -6], rKnee: 70, lArm: [-30, 0, 40], rArm: [30, 0, -30], lElbow: -50, rElbow: -50 }, paths: [[[0.6, -0.4], [0.3, 0.4], [-0.9, 1.4]]] },
  'c12-lunge': { ...F, pose: lunge },
  'c13-nordic': { cam: [4.0, 1.2, 1.4], target: [0, 0.45, 0], fov: 34, pose: { root: [0, 0.45, 0.25], rootX: 35, lLeg: [0, 0, 3], lKnee: 55, rLeg: [0, 0, -3], rKnee: 55, lArm: [-60, 0, 12], rArm: [-60, 0, -12], lElbow: -30, rElbow: -30 } },
  // D — U14 Game skills
  'd1-half-turn': { ...F, pose: { torsoY: 35, headY: 20, lLeg: [-10, 0, 10], lKnee: 15, rLeg: [8, 0, -12], rKnee: 22, lArm: [0, 0, 30], rArm: [0, 0, -40], lElbow: -30, rElbow: -30 }, balls: [[0.35, 0.11, 0.4]], paths: [[[-1.6, -1.2], [-0.2, 0.2]], [[0.5, 0.5], [1.6, 1.4]]] },
  'd2-scan-pass': { ...F, pose: { torsoY: -15, headY: 70, lLeg: [0, 0, 6], rLeg: [-10, 0, -6], rKnee: 15, lArm: [0, 0, 25], rArm: [0, 0, -25], lElbow: -30, rElbow: -30 }, balls: [[0, 0.11, 0.45]], cones: [[-1.4, -1.2], [1.6, -1.4]] },
  'd3-1v1-gate': { ...F, pose: { ...sprint, torsoZ: 10 }, balls: [[0.1, 0.11, 0.7]], cones: [[-0.5, 2], [0.5, 2]], paths: [[[0.1, 0.9], [0.8, 1.6], [0, 2.6]]] },
  'd4-striking': { ...S, pose: kick, balls: [[2.0, 0.35, 0]], cones: [[4.6, -0.6], [4.6, 0.6]], paths: [[[1.0, 0], [4.4, 0]]], target: [1.3, 0.6, 0], cam: [1.0, 1.4, 4.8], fov: 38 },
  'd5-acceleration': { ...S, pose: { ...sprint, rootY: 90, torsoX: 30 }, paths: [[[0.8, 0.35], [3.4, 0.35]]] },
  'd6-shuttle': { ...F, pose: { root: [0, 0.84, 0], torsoX: 22, lLeg: [-15, 0, 26], lKnee: 42, rLeg: [-15, 0, -26], rKnee: 42, lArm: [-20, 0, 30], rArm: [-20, 0, -30], lElbow: -60, rElbow: -60 }, cones: [[-1.4, 0.2], [0, 0.2], [1.4, 0.2]], paths: [[[0, 0.7], [1.3, 0.7]], [[1.3, 0.9], [-1.3, 0.9]]] },
  'd7-bodyweight': { ...F, pose: lunge },
  'd8-varied-dribble': { ...F, pose: { root: [0, 0.94, 0], torsoX: 14, torsoZ: -8, lLeg: [-25, 0, 6], lKnee: 30, rLeg: [8, 0, -22], rKnee: 40, lArm: [10, 0, 40], rArm: [0, 0, -45], lElbow: -30, rElbow: -30 }, balls: [[-0.25, 0.11, 0.45]], cones: [[0.8, 1.4], [-0.6, 2.2]], paths: [[[-0.2, 0.7], [0.5, 1.2], [-0.3, 2.0], [0.4, 2.8]]] },
  'd9-small-game': { ...F, pose: { ...sprint, torsoX: 14 }, balls: [[0.1, 0.11, 0.7]], cones: [[-1.3, 2.6], [-0.5, 2.6], [1.3, -1.5], [0.5, -1.5]] },
}

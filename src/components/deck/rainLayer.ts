import * as THREE from 'three'

/**
 * 船上视角的雨幕。
 *
 * 【来源】构图与参数取自用户另一个项目的 `weather.js`（900 条线段、雨层跟随相机、
 * 落到底就重生）。这里把**位置更新从 CPU 搬到 GPU**：他那边每帧要写 900×6 个
 * float（JavaScrip 循环 + 上传缓冲区），而这段逻辑完全是时间与种子的解析函数，
 * 顶点着色器里算一次即可，CPU 每帧只更新两个 uniform。
 *
 * 【为什么用 LineSegments 而不是 Points】雨在画面上是**细长的线**。Points 是方块，
 * 无论贴图怎么画都在做"圆点"，正对镜头的雨点读作雪花。
 *
 * 【为什么雨的坐标相对相机】雨层整体跟着相机走（`rain.position` 每帧对齐），
 * 局部坐标只在 ±R 内 —— 于是无论船开到哪里，画面里的雨量恒定，且不会出现
 * "开出去以后雨被落在后面"。
 */

/** 雨滴覆盖半径（局部坐标，世界单位） */
const RAIN_RADIUS = 24
/** 雨从多高落下 */
const RAIN_HEIGHT = 15

export interface DeckRain {
  mesh: THREE.LineSegments
  /**
   * 设置**画多少滴**（不是 0..1 的比例）。
   *
   * 【为什么参数是数量】第一版收 0..1，而调用方传的是 `rainDropCount()` 算出的
   * 滴数（0~1500）—— 于是每个非零值都被 clamp 到 1，雨在"小雨"和"暴风雨"里
   * 一样满。屏幕上只是"下得有点大"，不报错；是靠探针读 drawRange 才发现
   * 两种天气都是 3000 顶点。
   */
  setAmount(drops: number): void
  /** 每帧：随时间下落、跟随相机、按风向倾斜 */
  update(t: number, camX: number, camZ: number): void
  dispose(): void
}

export function createDeckRain(maxDrops = 520, seed = 20261110): DeckRain {
  // 确定性的伪随机数（xorshift）：截图巡检要可复现，不能用 Math.random
  let s = seed >>> 0
  const rnd = () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }

  const pos = new Float32Array(maxDrops * 2 * 3)
  const end = new Float32Array(maxDrops * 2)
  const len = new Float32Array(maxDrops * 2)
  for (let i = 0; i < maxDrops; i++) {
    // x / z 撒在相机周围，y 存"相位"（0..1），真正的高度在 shader 里算
    /*
     * 圆盘均匀分布（r = sqrt(u)·R）：方形均匀会让**靠近相机的雨滴太少** ——
     * 屏幕上雨的密度几乎全部来自近处那 10 个单位，方形分布把一半雨滴撒到了
     * 远处（那里被 vFade 削掉），实测 520 滴只看得见几条。
     */
    const r = Math.sqrt(rnd()) * RAIN_RADIUS
    const th = rnd() * Math.PI * 2
    const x = Math.cos(th) * r
    const z = Math.sin(th) * r
    const phase = rnd()
    // 长度 0.25~0.75：船长 1.8，雨丝要短于船的一根桅杆，否则读作"划痕"
    const l = 0.6 + rnd() * 1.3
    // 每滴的速度差：用相位偏移模拟（相位乘一个 0.85~1.15 的系数会破坏 fract 循环，
    // 所以改用固定速度 + 不同相位；视觉上已经足够"不是整齐下落"）
    for (let k = 0; k < 2; k++) {
      const v = (i * 2 + k) * 3
      pos[v] = x
      pos[v + 1] = phase
      pos[v + 2] = z
      end[i * 2 + k] = k
      len[i * 2 + k] = l
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
  geo.setAttribute('aLen', new THREE.BufferAttribute(len, 1))
  geo.setDrawRange(0, 0)

  const uniforms = {
    uTime: { value: 0 },
    uTilt: { value: 0 },
    uHeight: { value: RAIN_HEIGHT },
    /*
     * 颜色是**sRGB 数值**，不是线性值。
     * 这个材质自己写 gl_FragColor（three 不会替你转换），所以直接写显示色最省事；
     * 若要改成线性值就必须补 srgbEncode，否则雨会亮一大截。
     */
    uColor: { value: new THREE.Vector3(0.84, 0.9, 0.97) },
    uOpacity: { value: 0 },
  }

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uTilt;
      uniform float uHeight;
      attribute float aEnd;
      attribute float aLen;
      varying float vFade;

      void main() {
        vec3 p = position;                       // x, phase, z
        float fall = fract(p.y - uTime * 0.42);   // 0..1 循环下落
        float y = fall * uHeight;
        /*
         * 风把雨吹斜。
         *
         * 【第一版为什么是竖直的】只给整滴加了一个 x 方向的位移 drift ——
         * 一滴的两个端点用的是同一个 x，于是位移只是把雨滴整体挪开，线段本身
         * 仍然垂直。屏幕上"斜雨"看不出来，tilt 从 0 调到 2.4 也没区别。
         * 倾斜必须体现在**两端点的差**上：尾端比头端多偏 aLen·skew。
         */
        float drift = uTilt * fall * 3.0;
        float skew = uTilt * 0.24;
        vec3 w = vec3(p.x + drift + aEnd * aLen * skew, y + aEnd * aLen, p.z);
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float dist = -mv.z;
        /*
         * 远的雨滴淡掉：否则 50 单位外的几百条线会糊成一层白纱，把岸线盖住。
         * 1.0 那一项是"雨丝的头比尾亮"—— 头是切线方向的尖端，尾在运动模糊里更淡。
         */
        vFade = smoothstep(52.0, 6.0, dist) * (0.5 + 0.5 * aEnd);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * vFade);
      }
    `,
  })

  const mesh = new THREE.LineSegments(geo, mat)
  mesh.name = 'deck-rain'
  mesh.frustumCulled = false
  // 雨要画在船与岸的**前面**（在空气里），但仍在 HUD 后面
  mesh.renderOrder = 8

  let amount = 0
  return {
    mesh,
    setAmount(drops) {
      const n = Number.isFinite(drops) ? Math.min(maxDrops, Math.max(0, Math.round(drops))) : 0
      const v = n / maxDrops
      amount = v
      uniforms.uOpacity.value = 0.86 * v
      // 0 滴时整层不绘制（连 3000 个顶点都不提交）
      mesh.visible = n > 0
      geo.setDrawRange(0, n * 2)
    },
    update(t, camX, camZ) {
      if (amount <= 0.001) return
      uniforms.uTime.value = t
      mesh.position.set(camX, 0, camZ)
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

/** 让雨往风向倾斜（正 = +x）。与浪、船的横摇共用同一个符号约定 */
export function rainTiltFromWind(windDirDeg: number, windSpeed: number): number {
  if (!Number.isFinite(windDirDeg) || !Number.isFinite(windSpeed)) return 0
  // 风向往 x 分量：90° 是"吹向东"（+x），270° 吹向西
  const rad = (windDirDeg * Math.PI) / 180
  const k = Math.min(1.4, Math.max(0, windSpeed / 26))
  return Math.sin(rad) * k * 0.9
}

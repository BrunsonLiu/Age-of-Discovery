import * as THREE from 'three'

/**
 * 3D 海图的轻量后处理：**只做辉光**（外加一点点高光柔肩与分离色调）。
 *
 * 【为什么需要】我们刚给 20 个港口做了夜间灯火，但灯是 4 个 Points——
 * 没有辉光时它只是一小片发白的圆点。真实夜景里，灯在镜头里会"糊开一圈"，
 * 那圈光晕才是电影感的来源。月亮的亮边、浅水带的高光同理。
 *
 * 【为什么只做辉光，不做暗角/颗粒/色差】
 * · 暗角：`outerVignette` 已经是一张几何贴图，再叠一层会二次压暗；
 * · 颗粒：我们的纸面本身有 grain（land-texture 巡检守着 ≥6），
 *   再叠动态噪点会读成"视频压缩噪点"，与手绘纸面冲突；
 * · 色差：这是俯视海图，不是镜头特写，边缘色散只会让人以为贴图错位。
 * 取景语言不同，只取"光"这一项。
 *
 * 【实现取舍】
 * · 场景先画进一张 8bit 全分辨率 RT（材质在这一步已经过 ACES 色调映射，
 *   输出 ≤1，8bit 够用，显存带宽比半浮点省一半）；
 * · 亮部提取与两遍可分离模糊都在**半分辨率**上做，画面里"光晕"本来就是低频；
 * · 合成时手动做 sRGB 编码：`ShaderMaterial` 不像内置材质那样自动追加
 *   `colorspace_fragment`，忘了这一步整张图会偏暗偏灰（踩过）。
 *
 * 【成本】1 次全屏拷贝 + 3 次半分辨率全屏 + 1 次合成。低端机由既有的
 * `adaptiveResolution` 先降 pixelRatio，本模块的像素量随 drawingBuffer 一起降。
 */

export interface Map3DPost {
  render(scene: THREE.Scene, camera: THREE.Camera): void
  /** 取证用：暴露场景缓冲，脚本要能直接读它的像素（判断"存的是线性还是显色"） */
  readonly debugSceneRT: THREE.WebGLRenderTarget
  setEnabled(on: boolean): void
  readonly enabled: boolean
  /**
   * 设置辉光强度（0 = 只走合成、不加光晕）。
   *
   * 【为什么需要这个入口】"关掉辉光必须等于直出"是本文件的核心判据，
   * 而 `setEnabled(false)` 是**绕开整条链路**，验不出合成里的色彩转换是否对。
   * 只有把强度降到 0、仍走合成，才能逐像素对账。
   */
  setBloom(strength: number): void
  /**
   * 设置亮部阈值（线性口径）。
   *
   * 【为什么需要按场景调】海图的"亮"是港口灯火与月亮（很亮的点光源），
   * 阈值 0.45 正好只捞它们；而船上视角里**海面的月光反射**本身就是一条
   * 高光带（线性值 0.5~0.9），0.45 会把它整条捞进去、模糊后叠成一条白公路。
   * 两个场景的"亮部"分布不同，阈值就不能共用一个。
   */
  setThreshold(t: number): void
  dispose(): void
}

/** 辉光强度的默认值（`setBloom` 可以临时改它做 A/B） */
const BLOOM_STRENGTH = 0.62
/**
 * 亮部阈值（**线性口径**，场景缓冲是线性 HalfFloat）。
 * 夜里海面 ≈0.05~0.12、陆地 ≈0.18~0.35、灯笼芯/月亮 ≈0.8~1.0。
 * 0.45 只捞灯与月亮，不会把陆地整块糊亮。
 */
const BLOOM_THRESHOLD = 0.45
/** 柔肩：接近上限的亮度二次压缩，避免月亮与灯火糊成死白 */
const SHOULDER = 0.55
/** 分离色调强度：暗部微冷、亮部微暖，非常轻 */
const SPLIT = 0.35

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** 亮部提取：只留超过阈值的部分，并做软膝，避免灯心边缘出现硬边 */
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = smoothstep(uThreshold, uThreshold + 0.28, l);
  gl_FragColor = vec4(c * knee, 1.0);
}
`

/** 可分离高斯：9 抽头，uDir 一次给水平、一次给垂直 */
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;      // 一个纹素的步长（已乘方向）
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSrc, vUv).rgb * 0.227027;
  sum += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.316216;
  sum += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.316216;
  sum += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.070270;
  sum += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uShoulder;
uniform float uSplit;
varying vec2 vUv;

/*
 * 【为什么要自己写 sRGB 编码，不用 three 的 colorspace_fragment】
 * 在 ShaderMaterial 里那个 chunk 生成的是**纯 gamma 1/2.2**，而画布走的是
 * 分段式 sRGB（低亮度段是 12.92 的直线）。实测同一像素：
 *   直出 rgb(7,29,60)  vs  用 chunk 合成 rgb(14,38,61) —— 暗部整整抬 7/255。
 * 自己写分段式之后两者逐像素一致（见 .workbuddy/probe-post-shots.mjs）。
 */
vec3 srgbEncode(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  vec3 base = texture2D(tScene, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  /* 光晕略偏暖：灯的周围本来就该是暖的，纯白糊开会读成雾 */
  bloom *= mix(vec3(1.0), vec3(1.06, 1.0, 0.94), 0.5);
  vec3 col = base + bloom * uBloom;

  /* 高光柔肩：云、月光、灯芯不至于并成一块死白 */
  vec3 over = max(col - vec3(0.74), 0.0);
  col -= over * over * uShoulder;

  /*
   * 分离色调：**只给高光一点暖**，暗部不动。
   *
   * 【为什么暗部不许抬】第一版照搬了"暗部微冷、亮部微暖"的常规做法
   * （shadowTint 蓝 +0.02），实测夜里阴影亮度 24 → 37（+13/255），
   * 整张图的夜被"提灰"了 —— 这与我们自己的夜里口径冲突（夜只压到 0.72 倍
   * 并偏蓝，是"看不清但不关灯"，不是"雾上一层"）。而且冷却暗部这件事，
   * coolLine 已经在墨线/叠加层上做过了，重做等于叠两次。
   */
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 highTint = vec3(0.022, 0.010, -0.012);
  col += highTint * smoothstep(0.45, 0.95, luma) * uSplit;

  gl_FragColor = vec4(srgbEncode(clamp(col, 0.0, 1.0)), 1.0);
}
`

export function createMap3DPost(renderer: THREE.WebGLRenderer): Map3DPost {
  const quadGeo = new THREE.PlaneGeometry(2, 2)
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadScene = new THREE.Scene()
  // 初始材质随时被替换（draw() 里换），这里给一个占位
  const placeholder = new THREE.MeshBasicMaterial()
  // 显式标成 THREE.Mesh：后面会把材质换成 ShaderMaterial，默认泛型只允许 MeshBasicMaterial
  const quad: THREE.Mesh = new THREE.Mesh(quadGeo, placeholder)
  quad.frustumCulled = false
  quadScene.add(quad)

  const rtOpt = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  }
  /*
   * 【场景缓冲：线性 + 半浮点，不要把它标成 sRGB】
   * 踩过两个坑，都用量化数据定死了：
   * ① 标成 sRGB ⇒ three 会用 SRGB8_ALPHA8 分配，**采样时硬件自动解码回线性**；
   *    合成若不再编码，整张图会黑成 mean 12/255（实测）。
   * ② 8bit + 线性存储 ⇒ 暗部量化粗，sRGB 一拉开就成了"暗部被抬 6/255"。
   * 正解是线性 + HalfFloat 存储，最后由合成本身的 `colorspace_fragment`
   * 完成与画布一致的编码（three 自己就在 OutputPass 里这么做）。
   */
  const sceneRT = new THREE.WebGLRenderTarget(2, 2, { ...rtOpt, depthBuffer: true, type: THREE.UnsignedByteType })
  sceneRT.texture.colorSpace = THREE.SRGBColorSpace
  // 亮部与模糊：半分辨率、半浮点（光晕是低频，半浮点足够且不丢亮部）
  const brightRT = new THREE.WebGLRenderTarget(2, 2, { ...rtOpt, type: THREE.HalfFloatType })
  const blurA = new THREE.WebGLRenderTarget(2, 2, { ...rtOpt, type: THREE.HalfFloatType })
  const blurB = new THREE.WebGLRenderTarget(2, 2, { ...rtOpt, type: THREE.HalfFloatType })

  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: sceneRT.texture }, uThreshold: { value: BLOOM_THRESHOLD } },
    vertexShader: VERT,
    fragmentShader: BRIGHT_FRAG,
    depthTest: false,
    depthWrite: false,
  })
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  })
  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneRT.texture },
      tBloom: { value: blurB.texture },
      uBloom: { value: BLOOM_STRENGTH },
      uShoulder: { value: SHOULDER },
      uSplit: { value: SPLIT },
    },
    vertexShader: VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
  })

  let on = true
  let w = 2
  let h = 2

  const size = new THREE.Vector2()
  const resize = () => {
    renderer.getDrawingBufferSize(size)
    const nw = Math.max(2, Math.floor(size.x))
    const nh = Math.max(2, Math.floor(size.y))
    if (nw === w && nh === h) return
    w = nw
    h = nh
    sceneRT.setSize(w, h)
    const bw = Math.max(2, Math.floor(w * 0.5))
    const bh = Math.max(2, Math.floor(h * 0.5))
    brightRT.setSize(bw, bh)
    blurA.setSize(bw, bh)
    blurB.setSize(bw, bh)
  }

  const draw = (mat: THREE.Material, target: THREE.WebGLRenderTarget | null) => {
    quad.material = mat
    renderer.setRenderTarget(target)
    renderer.render(quadScene, quadCam)
  }

  return {
    get enabled() {
      return on
    },
    setBloom(strength) {
      // 直接写 uniform：改一个局部变量不会传进 shader（第一版就是这么错的）
      compositeMat.uniforms.uBloom.value = Number.isFinite(strength) ? Math.max(0, strength) : 0
    },
    setThreshold(t) {
      brightMat.uniforms.uThreshold.value = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : BLOOM_THRESHOLD
    },
    get debugSceneRT() {
      return sceneRT
    },
    setEnabled(v: boolean) {
      on = v
    },
    render(scene, camera) {
      if (!on) {
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        return
      }
      // 自适应分辨率会改 drawingBuffer，尺寸必须每帧对一次（开销只有一次比较）
      resize()

      renderer.setRenderTarget(sceneRT)
      renderer.render(scene, camera)

      draw(brightMat, brightRT)
      // 水平 → 垂直（在 A 上做水平、B 上做垂直，最后从 B 采样）
      blurMat.uniforms.tSrc!.value = brightRT.texture
      ;(blurMat.uniforms.uDir!.value as THREE.Vector2).set(1 / (w * 0.5), 0)
      draw(blurMat, blurA)
      blurMat.uniforms.tSrc!.value = blurA.texture
      ;(blurMat.uniforms.uDir!.value as THREE.Vector2).set(0, 1 / (h * 0.5))
      draw(blurMat, blurB)

      draw(compositeMat, null)
      renderer.setRenderTarget(null)
    },
    dispose() {
      sceneRT.dispose()
      brightRT.dispose()
      blurA.dispose()
      blurB.dispose()
      brightMat.dispose()
      blurMat.dispose()
      compositeMat.dispose()
      quadGeo.dispose()
      placeholder.dispose()
    },
  }
}

/**
 * 辉光对哪些东西有用（判断口径，写在这里省得以后争）：
 * · 有用：灯笼/港口灯火/月亮/浅水带高光 —— 都是"该溢出的光"；
 * · 无用：海岸墨线、经纬网、航线虚线 —— 它们本来就该是**硬边**的墨。
 * 所以强度只给到 0.62：线不会被糊开，只有接近 1 的亮点才起晕。
 */
export const BLOOM_TUNING = { BLOOM_STRENGTH, BLOOM_THRESHOLD, SHOULDER, SPLIT } as const

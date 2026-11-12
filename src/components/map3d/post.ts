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

/**
 * 画布颗粒强度（编码后的 srgb 域的加法幅度）。
 * 0.022 ≈ ±5.6/255：在 100% 缩放、JPEG 压缩后仍能读出"纸/布"的颗粒，
 * 又不至于在纯色天空上变成噪点。
 * 0.03 时整幅画面像"用了 1600 ISO"（实测）。
 */
const GRAIN = 0.022
/** 暗角强度：四角压 16% */
const VIGNETTE = 0.2

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uShoulder;
uniform float uSplit;
uniform float uGrain;
uniform float uVignette;
uniform vec2 uTexel;
uniform float uFxaa;
varying vec2 vUv;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float fxLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/*
 * ---- FXAA（无 MSAA 时的抗锯齿）----
 *
 * 【为什么必须有】低模几何全是硬边缘：屋檐、桅杆、绳索、帆边、窗框。1:1 渲染
 * 时它们是一级一级的台阶，整幅画面读作"早期网页 3D"（这是"粗糙"里最容易量化、
 * 也最容易根治的一顶）。
 *
 * 【为什么和 MSAA 互斥】GPU 上 MSAA 4x 更准（对细线尤其），开着 FXAA 反而把
 * 已经干净的边缘再糊一遍；软件渲染（swiftshader，e2e 与探针）下 MSAA 会把
 * 帧率打到个位数，就让 FXAA 顶上。
 *
 * 【为什么阈值按"线性亮度"给】tScene 是硬件线性化的 sRGB 纹理，采样出来是
 * 线性值 —— 线性域里暗部数值很小，按 srgb 习惯给 0.06 会漏掉一大半边缘。
 * 0.035 是实测：能把屋面/桅杆的台阶压平，又不会把远处的窗格糊成一片。
 */
vec3 fxaaSample(vec2 uv) {
  vec3 rgbM = texture2D(tScene, uv).rgb;
  vec3 rgbNW = texture2D(tScene, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(tScene, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(tScene, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(tScene, uv + vec2(1.0, 1.0) * uTexel).rgb;
  float lM = fxLuma(rgbM);
  float lNW = fxLuma(rgbNW), lNE = fxLuma(rgbNE), lSW = fxLuma(rgbSW), lSE = fxLuma(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < 0.035) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb
                + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb
                           + texture2D(tScene, uv + dir * 0.5).rgb);
  float lB = fxLuma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}

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
  vec3 base = uFxaa > 0.5 ? fxaaSample(vUv) : texture2D(tScene, vUv).rgb;
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

  /*
   * ---- 统一的暖调（让 3D 画面与羊皮纸/油画的海图、岸上"同温"）----
   *
   * 【为什么这是"风格"而不是"滤镜"】同一局游戏里，2D 海图是暖棕的羊皮纸、
   * 岸上是暖调油画，唯独甲板与 3D 海图偏冷偏灰 —— 三个界面像三个游戏。
   * 这里按亮度做一次极轻的分离：暗部偏冷（−1.5% R、+1.5% B）、亮部偏暖
   * （+3% R、−2.5% B），中间平滑过渡。幅度必须小 —— 0.06 的 R 偏移就会
   * 让海水发绿、白云发黄（实测）。
   */
  col *= mix(vec3(0.985, 0.997, 1.015), vec3(1.030, 1.006, 0.976), smoothstep(0.22, 0.85, luma));

  vec3 outc = srgbEncode(clamp(col, 0.0, 1.0));
  /*
   * ---- 画布颗粒 + 暗角（介质质感）----
   *
   * 【为什么这一步比继续加几何有效】甲板视角是纯几何 + 平涂材质，而另外三个界面
   * 是羊皮纸海图与油画 —— 差距不在"缺哪个物件"，在**介质**。一层 ±3/255 的
   * 静止颗粒让白墙、红瓦、天空这些大面积纯色块立刻有"印在纸上"的读感。
   *
   * 【为什么用 gl_FragCoord 而不是 vUv × 时间】① 颗粒必须**随屏幕像素固定**，
   * 跟着 uv 走会随相机移动而在世界坐标里滑动（像脏镜头在飘）；
   * ② 不能随时间变，否则 60fps 下整幅画面在闪（噪点闪烁比没有颗粒更糟）。
   * 两个尺度（1× 与 0.37×）叠一点低频，才像纸纹而不是电视雪花。
   */
  float g = hash21(floor(gl_FragCoord.xy)) * 0.62
          + hash21(floor(gl_FragCoord.xy * 0.37) + 11.3) * 0.38;
  outc += (g - 0.5) * uGrain;
  /* 暗角：四角压 16%，把视线收回中心，也顺手压掉四角的空海 */
  vec2 dv = vUv - 0.5;
  outc *= 1.0 - uVignette * pow(clamp(length(dv) * 1.42, 0.0, 1.0), 2.2);
  gl_FragColor = vec4(outc, 1.0);
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
  /*
   * ---- 抗锯齿为什么放在后处理里，而不是 MSAA ----
   *
   * 【根因】场景是渲染到**离屏 RT** 的，`new THREE.WebGLRenderer({ antialias: true })`
   * 只对默认 framebuffer 生效 —— 对 RT 完全无效。于是低模几何的硬边缘
   * （屋檐、桅杆、绳索、帆边、窗框）全是一级级的台阶，整幅画面读作
   * "早期网页 3D"。这是"粗糙"里最容易量化、也最容易根治的一项。
   *
   * 【为什么不用 RT 的 samples（MSAA）】能开，但质量依赖驱动：swiftshader 的
   * `maxSamples` 是 0（探针与 e2e 全在这里跑），真实显卡上又会走另一条路径 ——
   * 两条路径的画质不同、还各自有失败模式。改成 FXAA 之后只有一条路径，
   * 探针截的图就是玩家看到的图（可验证优先于理论画质）。
   *
   * `?noaa=1` 关掉它，用来做 A/B（对比截图在 .workbuddy/verify）。
   */
  const noAA = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('noaa') === '1'
  const sceneRT = new THREE.WebGLRenderTarget(2, 2, {
    ...rtOpt,
    depthBuffer: true,
    type: THREE.UnsignedByteType,
  })
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
      uGrain: { value: GRAIN },
      uVignette: { value: VIGNETTE },
      uTexel: { value: new THREE.Vector2(1 / 1440, 1 / 900) },
      uFxaa: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
  })

  ;(compositeMat.uniforms.uFxaa as { value: number }).value = noAA ? 0 : 1

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
    const fx = compositeMat.uniforms.uTexel as { value: THREE.Vector2 }
    fx.value.set(1 / w, 1 / h)
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

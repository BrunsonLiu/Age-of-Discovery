import MainMap from "@/pages/MainMap"

/**
 * 【这里原来套了 react-router】
 * `HashRouter + Routes + 一条 <Route path="/">` —— 整个应用只有一个页面，
 * 路由不提供任何东西（没有深链接、没有 useNavigate、没有 useParams，全项目 grep 只有
 * 这一个文件引用过 react-router）。代价是首屏多一个 35KB（13KB gz）的 vendor chunk，
 * 而这 13KB 恰好在最贵的位置上：它是"地图/面板拆出去之后"首个 chunk 里最大的死重量。
 * 换成直接渲染页面。以后真要做多页（比如图鉴独立页），再按需引回来。
 */
export default function App() {
  return <MainMap />
}

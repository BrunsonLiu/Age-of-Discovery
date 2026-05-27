import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import MainMap from "@/pages/MainMap"

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainMap />} />
      </Routes>
    </Router>
  )
}

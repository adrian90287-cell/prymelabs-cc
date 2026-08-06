import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode intentionally double-invokes render functions and effects (mount
// → cleanup → mount again) to surface missing-cleanup bugs — genuinely useful
// while developing, but it means every page's on-mount data fetch fires twice
// for every real visitor if left on in the production build, which is what
// was happening here. Kept for local `vite dev`, skipped in the production
// build real users get.
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  import.meta.env.DEV
    ? <React.StrictMode><App /></React.StrictMode>
    : <App />
)

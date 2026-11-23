import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyTheme, readTheme } from '@/common/theme'
import { rootPage } from './rootPage'

applyTheme(readTheme())

createRoot(document.getElementById('root')).render(<StrictMode>{rootPage(window.location.pathname)}</StrictMode>)

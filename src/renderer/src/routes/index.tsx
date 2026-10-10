import { Navigate } from 'react-router-dom'
import Home from '@renderer/pages/home'
import Telegram from '@renderer/pages/telegram'
import Zapret from '@renderer/pages/zapret'
import ServicesPage from '@renderer/pages/services'
import NetworkPage from '@renderer/pages/network'
import Logs from '@renderer/pages/logs'
import Settings from '@renderer/pages/settings'
import About from '@renderer/pages/about'

const routes = [
  { path: '/', element: <Navigate to="/home" replace /> },
  { path: '/home', element: <Home /> },
  { path: '/telegram', element: <Telegram /> },
  { path: '/zapret', element: <Zapret /> },
  { path: '/services', element: <ServicesPage /> },
  { path: '/network', element: <NetworkPage /> },
  { path: '/logs', element: <Logs /> },
  { path: '/settings', element: <Settings /> },
  { path: '/about', element: <About /> }
]

export default routes

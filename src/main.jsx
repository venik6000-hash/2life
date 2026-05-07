import ReactDOM from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './pwa/registerServiceWorker'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: '20px', fontFamily: 'Arial' }}>
    <h1>✅ React is working!</h1>
    <p>Backend: <span id="status">checking...</span></p>
  </div>
)

// Test backend connectivity
fetch('http://localhost:3001/api/dashboard')
  .then(r => r.json())
  .then(d => {
    document.getElementById('status')!.textContent = `${d.status || 'Connected'}`
  })
  .catch(e => {
    document.getElementById('status')!.textContent = `Error: ${e.message}`
  })

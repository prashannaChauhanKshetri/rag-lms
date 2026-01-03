import { useState } from 'react'
import Login from './components/Login'
import './index.css'

interface User {
  id: string;
  username: string;
  role: 'student' | 'instructor' | 'admin';
  full_name: string;
  email: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);

  const handleLoginSuccess = (userData: User) => {
    setUser(userData);
    console.log('Login successful:', userData);
    // TODO: Navigate to appropriate dashboard based on role
  };

  const handleLogout = () => {
    setUser(null);
    // Clear token from localStorage
    localStorage.removeItem('access_token');
    // TODO: Call logout API
  };

  return (
    <>
      {!user ? (
        <Login onLoginSuccess={handleLoginSuccess} />
      ) : (
        <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Welcome, {user.full_name}!</h1>
          <p>Role: {user.role}</p>
          <button className="btn btn-primary" onClick={handleLogout}>
            Logout
          </button>
          <p style={{ marginTop: '2rem', color: 'var(--text-secondary)' }}>
            Dashboard for {user.role} coming soon...
          </p>
        </div>
      )}
    </>
  )
}

export default App

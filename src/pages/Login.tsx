import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()

  return (
    <div className="page">
      <div className="panel">
        <h1 className="brand">Vocab Cards</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            login()
            navigate('/', { replace: true })
          }}
        >
          登录
        </button>
      </div>
    </div>
  )
}

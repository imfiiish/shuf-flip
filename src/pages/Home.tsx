import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="page home-page">
      <button className="btn btn-primary" onClick={() => navigate('/study')}>
        学习
      </button>
    </div>
  )
}

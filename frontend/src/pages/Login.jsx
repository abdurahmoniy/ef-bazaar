import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client.js';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/api/auth/v1/auth/login', form);
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login xato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Kirish</h1>
      <div className="form-group">
        <label htmlFor="username">Login</label>
        <input
          id="username"
          name="username"
          type="text"
          value={form.username}
          onChange={onChange}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="password">Parol</label>
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={onChange}
          required
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Kirilmoqda...' : 'Kirish'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

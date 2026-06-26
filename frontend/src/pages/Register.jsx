import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client.js';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await client.post('/api/auth/v1/auth/register', form);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Ro\'yxatdan o\'tishda xato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Ro'yxatdan o'tish</h1>
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
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
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
          minLength={8}
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Yuborilmoqda...' : 'Ro\'yxatdan o\'tish'}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

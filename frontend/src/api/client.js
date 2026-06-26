import axios from 'axios';

// Base URL: production da nginx orqali, dev da vite proxy orqali
const client = axios.create({
  baseURL: '/',
  timeout: 10000,
});

// Access token interceptor (localStorage da saqlanadi — refresh keyingi bosqichda)
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;

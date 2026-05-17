import axios from 'axios';

export function createApiClient() {
  const token = localStorage.getItem('secureChatToken');
  return axios.create({
    // Empty baseURL — requests go to /api/... and Vite proxies them to the server
    baseURL: '',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

import axios from 'axios';

export function resolveApiBaseUrl() {
  const maybeMeta = (globalThis as any).import?.meta;
  const configuredUrl = maybeMeta?.env?.VITE_API_URL;
  return (configuredUrl || 'http://localhost:3000').replace(/\/$/, '');
}

export function createApiClient() {
  const token = localStorage.getItem('secureChatToken');
  return axios.create({
    baseURL: resolveApiBaseUrl(),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

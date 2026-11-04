import axios, { type AxiosError, type AxiosInstance, type AxiosResponse } from 'axios'
import type { ApiResponse } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin
  } catch {
    return ''
  }
})()

// Uploaded media is stored as a backend-relative path (/uploads/x.jpg). Once the
// site is served from Firebase that path would resolve to the wrong origin, so
// responses are absolutised on the way in and stripped back on the way out.
function absolutizeUploads(node: unknown): unknown {
  if (typeof node === 'string') {
    return API_ORIGIN && node.startsWith('/uploads/') ? `${API_ORIGIN}${node}` : node
  }
  if (Array.isArray(node)) return node.map(absolutizeUploads)
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      (node as Record<string, unknown>)[key] = absolutizeUploads(value)
    }
  }
  return node
}

function relativizeUploads(node: unknown): unknown {
  if (typeof node === 'string') {
    return API_ORIGIN && node.startsWith(`${API_ORIGIN}/uploads/`) ? node.slice(API_ORIGIN.length) : node
  }
  if (Array.isArray(node)) return node.map(relativizeUploads)
  if (node && typeof node === 'object' && !(node instanceof FormData)) {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      (node as Record<string, unknown>)[key] = relativizeUploads(value)
    }
  }
  return node
}

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        if (config.data && typeof config.data === 'object') relativizeUploads(config.data)
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (response.data) absolutizeUploads(response.data)
        return response
      },
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - logout
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          const onAdminPortal = window.location.pathname.startsWith('/mugishaimekevin')
          if (!window.location.pathname.endsWith('login')) {
            window.location.href = onAdminPortal ? '/mugishaimekevin/login' : '/login'
          }
        }
        return Promise.reject(error)
      }
    )
  }

  public get<T = unknown>(url: string, params?: unknown): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.get<ApiResponse<T>>(url, { params })
  }

  public post<T = unknown>(url: string, data?: unknown): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.post<ApiResponse<T>>(url, data)
  }

  public put<T = unknown>(url: string, data?: unknown): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.put<ApiResponse<T>>(url, data)
  }

  public delete<T = unknown>(url: string): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.delete<ApiResponse<T>>(url)
  }

  public get baseURL(): string {
    return API_BASE_URL
  }
}

export const apiClient = new ApiClient()
export default apiClient
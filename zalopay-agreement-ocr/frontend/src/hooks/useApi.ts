import { useState, useCallback } from 'react'
import type { Agreement, AuditLog, ExtractedData, StorageFile } from '../types/agreement'

const BASE    = '/api/agreements'
const STORAGE = '/api/storage'

export function useAgreements() {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  const fetch = useCallback(async (page = 1, size = 10, status?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), size: String(size) })
      if (status) params.set('status', status)
      const r = await window.fetch(`${BASE}?${params}`)
      const data = await r.json()
      setAgreements(data.items ?? [])
      setTotal(data.total ?? 0)
      setPages(data.pages ?? 1)
      setCurrentPage(data.page ?? page)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStatusCounts = useCallback(async () => {
    try {
      const r = await window.fetch(`${BASE}/status-counts`)
      if (r.ok) setStatusCounts(await r.json())
    } catch { /* ignore */ }
  }, [])

  const upload = useCallback(async (file: File, actor = 'sales') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('actor', actor)
    const r = await window.fetch(`${BASE}/upload`, { method: 'POST', body: fd })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  }, [])

  const approve = useCallback(async (id: string, actor = 'kế toán') => {
    const r = await window.fetch(`${BASE}/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor }),
    })
    if (!r.ok) throw new Error(await r.text())
  }, [])

  const reject = useCallback(async (id: string, note: string, actor = 'kế toán') => {
    const r = await window.fetch(`${BASE}/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, actor }),
    })
    if (!r.ok) throw new Error(await r.text())
  }, [])

  const activate = useCallback(async (id: string, actor = 'kế toán') => {
    const r = await window.fetch(`${BASE}/${id}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor }),
    })
    if (!r.ok) throw new Error(await r.text())
  }, [])

  const updateData = useCallback(async (id: string, data: ExtractedData, actor = 'kế toán') => {
    const r = await window.fetch(`${BASE}/${id}/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed_data: data, actor }),
    })
    if (!r.ok) throw new Error(await r.text())
  }, [])

  const getAuditLog = useCallback(async (id: string): Promise<AuditLog[]> => {
    const r = await window.fetch(`${BASE}/${id}/audit`)
    return r.json()
  }, [])

  return {
    agreements, total, pages, currentPage, loading, statusCounts,
    fetch, fetchStatusCounts, upload, approve, reject, activate, updateData, getAuditLog,
  }
}

export function useStorage() {
  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const checkStatus = useCallback(async () => {
    const r = await window.fetch(`${STORAGE}/status`)
    const d = await r.json()
    setConfigured(d.configured)
    return d.configured as boolean
  }, [])

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.fetch(`${STORAGE}/files`)
      if (r.ok) {
        setFiles(await r.json())
        setConfigured(true)
      } else if (r.status === 503) {
        setConfigured(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const upload = useCallback(async (file: File, actor = 'sales') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('actor', actor)
    const r = await window.fetch(`${STORAGE}/upload`, { method: 'POST', body: fd })
    if (!r.ok) throw new Error(await r.text())
    return r.json() as Promise<{ agreement_id: string; s3_key: string; name: string }>
  }, [])

  const getDownloadUrl = useCallback(async (key: string): Promise<string> => {
    const r = await window.fetch(`${STORAGE}/download?key=${encodeURIComponent(key)}`)
    if (!r.ok) throw new Error('Không lấy được link download')
    const d = await r.json()
    return d.url
  }, [])

  const deleteFile = useCallback(async (key: string) => {
    const r = await window.fetch(`${STORAGE}/files?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    if (!r.ok) throw new Error(await r.text())
  }, [])

  return { files, loading, configured, checkStatus, fetchFiles, upload, getDownloadUrl, deleteFile }
}

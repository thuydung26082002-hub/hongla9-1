import { useState, useCallback } from 'react'
import type { Agreement, AuditLog, ExtractedData } from '../types/agreement'

const BASE = '/api/agreements'

export function useAgreements() {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.fetch(BASE)
      setAgreements(await r.json())
    } finally {
      setLoading(false)
    }
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

  return { agreements, loading, fetch, upload, approve, reject, activate, updateData, getAuditLog }
}

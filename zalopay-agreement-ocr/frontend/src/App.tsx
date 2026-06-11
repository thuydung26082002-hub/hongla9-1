import { useState, useEffect, useCallback, useRef } from 'react'
import type { Agreement, AuditLog, ExtractedData } from './types/agreement'
import { useAgreements } from './hooks/useApi'
import Header from './components/Header'
import Stepper from './components/Stepper'
import UploadZone from './components/UploadZone'
import AgreementTable from './components/AgreementTable'
import ReviewModal from './components/ReviewModal'
import ToastContainer, { type ToastMsg } from './components/Toast'

type Role = 'Sales' | 'Kế toán'

let toastId = 0

function activeStep(agreements: Agreement[]): number {
  if (agreements.length === 0) return 1
  const statuses = agreements.map(a => a.status)
  if (statuses.some(s => s === 'Đã kích hoạt')) return 6
  if (statuses.some(s => s === 'Đã duyệt')) return 6
  if (statuses.some(s => s === 'Chờ duyệt')) return 5
  if (statuses.some(s => s === 'Đang xử lý OCR')) return 3
  return 1
}

export default function App() {
  const [role, setRole] = useState<Role>('Kế toán')
  const [selected, setSelected] = useState<Agreement | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [uploading, setUploading] = useState(false)
  const prevPendingCount = useRef(0)

  const api = useAgreements()

  const toast = useCallback((message: string, type: ToastMsg['type'] = 'info') => {
    const id = ++toastId
    setToasts(t => [...t, { id, type, message }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  // Initial load + polling
  useEffect(() => {
    api.fetch()
    const interval = setInterval(() => api.fetch(), 15000)
    return () => clearInterval(interval)
  }, [api.fetch])

  // Notify kế toán when new pending agreements appear
  useEffect(() => {
    const pending = api.agreements.filter(a => a.status === 'Chờ duyệt').length
    if (role === 'Kế toán' && pending > prevPendingCount.current) {
      toast(`Có ${pending - prevPendingCount.current} hồ sơ mới đang Chờ duyệt`, 'info')
    }
    prevPendingCount.current = pending
  }, [api.agreements, role, toast])

  // Open review + load audit log
  const openReview = useCallback(async (ag: Agreement) => {
    setSelected(ag)
    const logs = await api.getAuditLog(ag.id)
    setAuditLogs(logs)
  }, [api.getAuditLog])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      await api.upload(file, role.toLowerCase())
      toast(`Đã upload "${file.name}" — đang xử lý OCR…`, 'success')
      await api.fetch()
    } catch (e) {
      toast(`Upload thất bại: ${e}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleApprove = async () => {
    if (!selected) return
    try {
      await api.approve(selected.id, role)
      toast('Đã phê duyệt hồ sơ', 'success')
      await api.fetch()
      const fresh = api.agreements.find(a => a.id === selected.id)
      if (fresh) setSelected(fresh)
    } catch (e) {
      toast(`Phê duyệt thất bại: ${e}`, 'error')
    }
  }

  const handleReject = async (note: string) => {
    if (!selected) return
    try {
      await api.reject(selected.id, note, role)
      toast('Đã từ chối hồ sơ', 'info')
      await api.fetch()
      const fresh = api.agreements.find(a => a.id === selected.id)
      if (fresh) setSelected(fresh)
    } catch (e) {
      toast(`Từ chối thất bại: ${e}`, 'error')
    }
  }

  const handleActivate = async () => {
    if (!selected) return
    try {
      await api.activate(selected.id, role)
      toast('Hồ sơ đã kích hoạt và push sang hệ thống chính thức!', 'success')
      await api.fetch()
      const fresh = api.agreements.find(a => a.id === selected.id)
      if (fresh) setSelected(fresh)
    } catch (e) {
      toast(`Kích hoạt thất bại: ${e}`, 'error')
    }
  }

  const handleSave = async (data: ExtractedData) => {
    if (!selected) return
    try {
      await api.updateData(selected.id, data, role)
      toast('Đã lưu nháp', 'success')
      await api.fetch()
    } catch (e) {
      toast(`Lưu thất bại: ${e}`, 'error')
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Header role={role} onRoleChange={setRole} />
      <Stepper active={activeStep(api.agreements)} />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Upload zone — only for Sales role */}
        {role === 'Sales' && (
          <UploadZone onUpload={handleUpload} uploading={uploading} />
        )}

        {/* Agreement queue */}
        <AgreementTable
          agreements={api.agreements}
          loading={api.loading}
          onRefresh={api.fetch}
          onReview={openReview}
        />
      </main>

      {/* Review modal */}
      {selected && (
        <ReviewModal
          agreement={selected}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onActivate={handleActivate}
          onSave={handleSave}
          auditLogs={auditLogs}
          role={role}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

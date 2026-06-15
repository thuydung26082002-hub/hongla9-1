import { useState, useEffect, useCallback, useRef } from 'react'
import type { Agreement, AuditLog, ExtractedData } from './types/agreement'
import { useAgreements } from './hooks/useApi'
import Header from './components/Header'
import Stepper from './components/Stepper'
import UploadZone from './components/UploadZone'
import AgreementTable from './components/AgreementTable'
import ReviewModal from './components/ReviewModal'
import StorageTab from './components/StorageTab'
import ToastContainer, { type ToastMsg } from './components/Toast'
import { List, HardDrive } from 'lucide-react'

type Role = 'Sales' | 'Kế toán'
type Tab = 'agreements' | 'storage'

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
  const [tab, setTab] = useState<Tab>('agreements')
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
    api.fetch(1)
    const interval = setInterval(() => api.fetch(api.currentPage), 15000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Open review by agreement ID (used from StorageTab)
  const openReviewById = useCallback(async (agreementId: string) => {
    // Try from current list first, otherwise fetch directly
    let ag = api.agreements.find(a => a.id === agreementId)
    if (!ag) {
      try {
        const r = await window.fetch(`/api/agreements/${agreementId}`)
        if (r.ok) ag = await r.json()
      } catch { /* ignore */ }
    }
    if (ag) {
      setTab('agreements')
      await openReview(ag)
    }
  }, [api.agreements, openReview])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      await api.upload(file, role.toLowerCase())
      toast(`Đã upload "${file.name}" — đang xử lý OCR…`, 'success')
      await api.fetch(1)
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
      await api.fetch(api.currentPage)
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
      await api.fetch(api.currentPage)
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
      await api.fetch(api.currentPage)
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
      await api.fetch(api.currentPage)
    } catch (e) {
      toast(`Lưu thất bại: ${e}`, 'error')
    }
  }

  const TABS = [
    { key: 'agreements' as Tab, label: 'Danh sách hồ sơ', icon: List },
    { key: 'storage' as Tab, label: 'Kho lưu trữ', icon: HardDrive },
  ]

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Header role={role} onRoleChange={setRole} />
      <Stepper active={activeStep(api.agreements)} />

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Tab navigation */}
        <div className="flex border-b border-gray-200 gap-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#0030CC] text-[#0030CC]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1A1F36]'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Danh sách hồ sơ */}
        {tab === 'agreements' && (
          <>
            {role === 'Sales' && (
              <UploadZone onUpload={handleUpload} uploading={uploading} />
            )}
            <AgreementTable
              agreements={api.agreements}
              loading={api.loading}
              total={api.total}
              page={api.currentPage}
              pages={api.pages}
              onRefresh={() => api.fetch(api.currentPage)}
              onPageChange={(p) => api.fetch(p)}
              onReview={openReview}
            />
          </>
        )}

        {/* Tab: Kho lưu trữ */}
        {tab === 'storage' && (
          <StorageTab
            role={role}
            onOpenAgreement={openReviewById}
          />
        )}
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

import { useState, useEffect, useRef } from 'react'
import { Upload, FileText, Download, Trash2, RefreshCw, ArrowRight, CloudOff, Loader2 } from 'lucide-react'
import type { StorageFile } from '../types/agreement'
import { useStorage } from '../hooks/useApi'

interface Props {
  role: 'Sales' | 'Kế toán'
  onOpenAgreement: (agreementId: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ file }: { file: StorageFile }) {
  if (!file.has_agreement) {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Chưa OCR</span>
  }
  const s = file.agreement_status
  if (s === 'Đang xử lý OCR') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
        <Loader2 size={10} className="animate-spin" /> Đang OCR…
      </span>
    )
  }
  const map: Record<string, string> = {
    'Chờ duyệt':    'bg-yellow-50 text-yellow-700',
    'Đã duyệt':     'bg-green-50 text-green-700',
    'Đã kích hoạt': 'bg-emerald-100 text-emerald-700',
    'Từ chối':      'bg-red-50 text-red-600',
  }
  return (
    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full ${map[s ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
      {s ?? 'Đã OCR'}
    </span>
  )
}

export default function StorageTab({ role, onOpenAgreement }: Props) {
  const storage = useStorage()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    storage.fetchFiles()
  }, [storage.fetchFiles])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      await storage.upload(file, role.toLowerCase())
      await storage.fetchFiles()
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (key: string, name: string) => {
    try {
      const url = await storage.getDownloadUrl(key)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async (key: string) => {
    if (!confirm('Xóa file này? Hồ sơ OCR liên quan sẽ không bị xóa.')) return
    setDeletingKey(key)
    try {
      await storage.deleteFile(key)
      await storage.fetchFiles()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingKey(null)
    }
  }

  // S3 not configured
  if (storage.configured === false) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center space-y-3">
        <CloudOff size={40} className="mx-auto text-gray-300" />
        <p className="font-semibold text-[#1A1F36]">Kho lưu trữ chưa được cấu hình</p>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Điền thông tin S3 vào <code className="bg-gray-100 px-1 rounded">.env.runtime</code>:
        </p>
        <pre className="text-xs text-left bg-gray-50 border border-gray-200 rounded-lg p-3 inline-block text-[#1A1F36]">
{`S3_ENDPOINT_URL=https://hcm04.vstorage.vngcloud.vn
S3_ACCESS_KEY=<access key>
S3_SECRET_KEY=<secret key>
S3_BUCKET_NAME=zalopay-agreements`}
        </pre>
        <p className="text-xs text-gray-400">
          Tạo credentials tại: <span className="font-mono">vstorage.vngcloud.vn → IAM → Service Account → S3 credentials</span>
        </p>
      </div>
    )
  }

  const ocrd = storage.files.filter(f => f.has_agreement).length

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      {role === 'Sales' && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
            ${uploading ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-[#0032C8] hover:bg-blue-50'}`}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f && !uploading) handleUpload(f)
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-[#0032C8]">
              <Loader2 size={18} className="animate-spin" /> Đang upload và kích hoạt OCR…
            </div>
          ) : (
            <>
              <Upload size={32} className="mx-auto mb-2 text-[#0032C8]" />
              <p className="font-semibold text-[#1A1F36] text-sm">Kéo thả hoặc click để upload</p>
              <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG · Tự động OCR sau khi upload</p>
            </>
          )}
        </div>
      )}

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          Upload thất bại: {uploadError}
        </div>
      )}

      {/* File list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#1A1F36]">
            Kho lưu trữ
            <span className="ml-2 text-sm font-normal text-gray-400">
              {storage.files.length} file · {ocrd} đã OCR
            </span>
          </h2>
          <button
            onClick={storage.fetchFiles}
            className="flex items-center gap-1.5 text-sm text-[#0030CC] hover:text-[#0033CC] font-medium"
          >
            <RefreshCw size={14} className={storage.loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>

        {storage.loading && storage.files.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Đang tải…
          </div>
        ) : storage.files.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {storage.configured === null ? 'Đang kết nối…' : 'Chưa có file nào trong kho lưu trữ.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[#6B7280] text-xs uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-semibold">Tên file</th>
                  <th className="px-6 py-3 text-left font-semibold">Kích thước</th>
                  <th className="px-6 py-3 text-left font-semibold">Ngày upload</th>
                  <th className="px-6 py-3 text-left font-semibold">Trạng thái OCR</th>
                  <th className="px-6 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {storage.files.map(file => (
                  <tr key={file.key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={15} className="text-[#0030CC] shrink-0" />
                        <span className="font-medium text-[#1A1F36] truncate max-w-[200px]" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-[#6B7280] text-xs">{formatBytes(file.size)}</td>
                    <td className="px-6 py-3 text-[#6B7280] text-xs">
                      {new Date(file.last_modified).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge file={file} />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {file.has_agreement && file.agreement_id && (
                          <button
                            onClick={() => onOpenAgreement(file.agreement_id!)}
                            title="Xem hồ sơ"
                            className="p-1.5 text-[#0030CC] hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <ArrowRight size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(file.key, file.name)}
                          title="Tải xuống"
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Download size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(file.key)}
                          disabled={deletingKey === file.key}
                          title="Xóa file"
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingKey === file.key
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

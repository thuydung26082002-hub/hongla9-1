import { useState, useRef, DragEvent } from 'react'
import { Upload, FileText, Loader } from 'lucide-react'

interface Props {
  onUpload: (file: File) => Promise<void>
  uploading: boolean
}

export default function UploadZone({ onUpload, uploading }: Props) {
  const [drag, setDrag] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setSelectedFile(file)
    await onUpload(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
      <h2 className="font-semibold text-[#1A1F36] mb-4 flex items-center gap-2">
        <Upload size={18} className="text-[#0030CC]" /> Upload hợp đồng
      </h2>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all
          ${drag ? 'border-[#0030CC] bg-blue-50' : 'border-gray-200 hover:border-[#0030CC] hover:bg-gray-50'}`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-[#0030CC]">
            <Loader size={36} className="animate-spin" />
            <p className="font-medium">Đang xử lý OCR…</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-2">
            <FileText size={36} className="text-[#00CC66]" />
            <p className="font-medium text-[#1A1F36]">{selectedFile.name}</p>
            <p className="text-sm text-[#6B7280]">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            <p className="text-xs text-[#00CC66]">✓ Đã upload — kéo thả file mới để upload tiếp</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-[#6B7280]">
            <Upload size={36} />
            <p className="font-medium">Kéo thả file vào đây hoặc bấm để chọn</p>
            <p className="text-sm">PDF, JPG, PNG — tối đa 20MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <p className="mt-3 text-xs text-[#6B7280]">
        Hoặc upload trực tiếp vào Drive folder:{' '}
        <a
          href="https://drive.google.com/drive/folders/1HTQghNunhDvIKbx_IRMH_j6YXVNBZbdp"
          target="_blank"
          rel="noreferrer"
          className="text-[#0030CC] underline"
        >
          Mở Google Drive
        </a>
        {' '}— hệ thống sẽ tự động phát hiện file mới sau {'{POLL_INTERVAL_SEC}'} giây.
      </p>
    </div>
  )
}

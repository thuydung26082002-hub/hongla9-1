import { useState } from 'react'
import { Sparkles, Eye, EyeOff } from 'lucide-react'

interface Props {
  label: string
  value: string | number | null | undefined
  confidence?: number | null
  sourceText?: string | null
  editable?: boolean
  onChange?: (v: string) => void
}

export default function AiField({ label, value, confidence, sourceText, editable = true, onChange }: Props) {
  const [showSource, setShowSource] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))

  const conf = confidence ?? null
  const low = conf !== null && conf < 0.7
  const pct = conf !== null ? Math.round(conf * 100) : null

  return (
    <div className={`rounded-lg border p-3 ${low ? 'confidence-low border-yellow-200' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">{label}</label>
        <div className="flex items-center gap-2">
          {pct !== null && (
            <span className="ai-badge flex items-center gap-0.5">
              <Sparkles size={10} /> {pct}%
            </span>
          )}
          {sourceText && (
            <button onClick={() => setShowSource(s => !s)} className="text-[#6B7280] hover:text-[#0030CC]">
              {showSource ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </div>
      </div>

      {editing && editable ? (
        <div className="flex gap-1">
          <input
            className="flex-1 border border-[#0030CC] rounded px-2 py-1 text-sm"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
          <button
            className="text-xs px-2 py-1 bg-[#0030CC] text-white rounded"
            onClick={() => { onChange?.(draft); setEditing(false) }}
          >
            Lưu
          </button>
          <button className="text-xs px-2 py-1 text-[#6B7280]" onClick={() => { setDraft(String(value ?? '')); setEditing(false) }}>
            Hủy
          </button>
        </div>
      ) : (
        <div
          className={`text-sm text-[#1A1F36] min-h-[1.5rem] ${editable ? 'cursor-pointer hover:text-[#0030CC]' : ''} ${!value ? 'text-[#6B7280] italic' : ''}`}
          onClick={() => editable && setEditing(true)}
          title={editable ? 'Bấm để chỉnh sửa' : undefined}
        >
          {value ?? 'Chưa có dữ liệu'}
        </div>
      )}

      {showSource && sourceText && (
        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-[#6B7280] border border-gray-200 italic">
          Nguồn: "{sourceText}"
        </div>
      )}
    </div>
  )
}

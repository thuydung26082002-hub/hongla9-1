import { useState, useRef } from 'react'
import { Download, Plus, X as XIcon, AlertTriangle } from 'lucide-react'
import type { FeeCell, FeeExtracted } from '../types/agreement'

type TemplateId = 'T1' | 'T2' | 'T3' | 'custom'

const TEMPLATE_DEFS: Record<'T1' | 'T2' | 'T3', { label: string; rows: string[]; cols: string[] }> = {
  T1: {
    label: 'T1 — Chuẩn ZaloPay 4 kênh',
    rows: [
      'Phí dịch vụ',
      'Phí xử lý hoàn trả',
      'Hoàn phí giao dịch thanh toán thành công cho đơn hàng hoàn trả',
    ],
    cols: [
      'Kênh Zalopay App',
      'Kênh khác > Zalopay Gateway > Thẻ nội địa',
      'Kênh khác > Zalopay Gateway > Thẻ quốc tế',
      'Kênh khác > Quét Mã QR đa năng',
    ],
  },
  T2: {
    label: 'T2 — Rút gọn App + QR',
    rows: ['Phí dịch vụ', 'Phí xử lý hoàn trả'],
    cols: ['Kênh Zalopay App', 'Kênh khác > Quét Mã QR đa năng'],
  },
  T3: {
    label: 'T3 — Nội bộ Ví + Cổng (8+7)',
    rows: ['Phí giao dịch', 'Phí hoàn tiền'],
    cols: [
      'Ví ZaloPay (Balance)', 'ATM', 'TK ngân hàng', 'VietQR', 'TKTS',
      'Số dư sinh lời', 'CC (trong nước)', 'CC (nước ngoài)',
      'ATM (Cổng)', 'TK ngân hàng (Cổng)', 'VietQR (Cổng)', 'TKTS (Cổng)',
      'Số dư sinh lời (Cổng)', 'CC nội địa (Cổng)', 'CC quốc tế (Cổng)',
    ],
  },
}

function confColor(c: number): string {
  if (c >= 0.85) return 'border-green-400 bg-white'
  if (c >= 0.70) return 'border-orange-400 bg-white'
  return 'border-red-400 bg-white'
}
function confText(c: number): string {
  if (c >= 0.85) return 'text-green-600'
  if (c >= 0.70) return 'text-orange-500'
  return 'text-red-500'
}

interface Props {
  fee: FeeExtracted
  onChange: (updated: FeeExtracted) => void
}

export default function FeeWorkbench({ fee, onChange }: Props) {
  const cells: FeeCell[] = fee.cells ?? []
  const vatIncluded = fee.vat_included

  const [templateId, setTemplateId] = useState<TemplateId>('T1')
  const [customRows, setCustomRows] = useState(['Phí giao dịch', 'Phí hoàn tiền'])
  const [customCols, setCustomCols] = useState(['App / Ví ZaloPay', 'QR đa năng'])
  const [assignments, setAssignments] = useState<Record<string, FeeCell>>(fee.assignments ?? {})
  const [dragOver, setDragOver] = useState<string | null>(null)
  const dragIdx = useRef<number | null>(null)

  const rows = templateId === 'custom' ? customRows : TEMPLATE_DEFS[templateId as 'T1' | 'T2' | 'T3'].rows
  const cols = templateId === 'custom' ? customCols : TEMPLATE_DEFS[templateId as 'T1' | 'T2' | 'T3'].cols

  const updateAndPropagate = (next: Record<string, FeeCell>) => {
    setAssignments(next)
    onChange({ ...fee, assignments: next })
  }

  const handleTemplateChange = (id: TemplateId) => {
    setTemplateId(id)
    setAssignments({})
    onChange({ ...fee, assignments: {} })
  }

  const handleDrop = (row: string, col: string) => {
    if (dragIdx.current === null) return
    const cell = cells[dragIdx.current]
    const k = `${row}|||${col}`
    updateAndPropagate({ ...assignments, [k]: cell })
    setDragOver(null)
    dragIdx.current = null
  }

  const removeSlot = (row: string, col: string) => {
    const next = { ...assignments }
    delete next[`${row}|||${col}`]
    updateAndPropagate(next)
  }

  const exportJSON = () => {
    const data: Record<string, Record<string, string>> = {}
    rows.forEach(row => {
      data[row] = {}
      cols.forEach(col => {
        const cell = assignments[`${row}|||${col}`]
        data[row][col] = cell ? cell.raw : '—'
      })
    })
    const assignedCells = new Set(Object.values(assignments))
    const chua_gan = cells.filter(c => !assignedCells.has(c)).map(c => ({ ...c }))
    const blob = new Blob(
      [JSON.stringify({ template: templateId, vat_included: vatIncluded, data, chua_gan }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'bieu_phi.json'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {vatIncluded === true && (
          <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">Đã bao gồm VAT</span>
        )}
        {vatIncluded === false && (
          <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
            <AlertTriangle size={11} />Chưa bao gồm VAT
          </span>
        )}
        <select
          value={templateId}
          onChange={e => handleTemplateChange(e.target.value as TemplateId)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0032C8] bg-white"
        >
          {(Object.entries(TEMPLATE_DEFS) as [string, { label: string }][]).map(([id, t]) => (
            <option key={id} value={id}>{t.label}</option>
          ))}
          <option value="custom">Tùy chỉnh</option>
        </select>
        <button
          onClick={exportJSON}
          className="flex items-center gap-1.5 text-sm bg-[#0032C8] text-white px-3 py-1.5 rounded-lg hover:bg-[#0029a8] transition-colors ml-auto"
        >
          <Download size={13} />Xuất JSON
        </button>
      </div>

      {/* OCR tray — flat list */}
      <div>
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-2">
          Danh sách mục phí OCR được ({cells.length}) — kéo vào ô bên dưới
        </p>
        {cells.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2 p-3 bg-[#F5F7FB] rounded-xl border border-gray-200 min-h-[72px]">
              {cells.map((cell, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => { dragIdx.current = idx }}
                  onDragEnd={() => { dragIdx.current = null }}
                  className={`cursor-grab active:cursor-grabbing select-none rounded-lg border-2 px-3 py-2 text-xs shadow-sm hover:shadow-md transition-shadow max-w-[220px] ${confColor(cell.confidence)}`}
                >
                  <div className={`text-[10px] truncate ${confText(cell.confidence)}`}>
                    {Math.round(cell.confidence * 100)}% tin cậy
                  </div>
                  <div className="font-bold text-[#14183A] truncate">{cell.raw}</div>
                  <div className="text-[10px] text-gray-500 truncate mt-0.5">{cell.label}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-1 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-green-400 inline-block" />≥85%</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-orange-400 inline-block" />70–84%</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-red-400 inline-block" />&lt;70% — kiểm lại</span>
            </div>
          </>
        ) : (
          <div className="bg-[#F5F7FB] rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
            Chưa có dữ liệu OCR — upload hợp đồng để AI bóc tách danh sách biểu phí
          </div>
        )}
      </div>

      {/* Custom template editor */}
      {templateId === 'custom' && (
        <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div>
            <p className="text-xs font-semibold text-[#0032C8] mb-2">Dòng (loại phí)</p>
            {customRows.map((r, i) => (
              <div key={i} className="flex items-center gap-1 mb-1.5">
                <input
                  value={r}
                  onChange={e => setCustomRows(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                />
                <button onClick={() => setCustomRows(prev => prev.filter((_, j) => j !== i))}>
                  <XIcon size={12} className="text-red-400" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setCustomRows(prev => [...prev, 'Loại phí mới'])}
              className="text-xs text-[#0032C8] flex items-center gap-1 mt-1"
            >
              <Plus size={11} />Thêm dòng
            </button>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#0032C8] mb-2">Cột (kênh thanh toán)</p>
            {customCols.map((c, i) => (
              <div key={i} className="flex items-center gap-1 mb-1.5">
                <input
                  value={c}
                  onChange={e => setCustomCols(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                />
                <button onClick={() => setCustomCols(prev => prev.filter((_, j) => j !== i))}>
                  <XIcon size={12} className="text-red-400" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setCustomCols(prev => [...prev, 'Kênh mới'])}
              className="text-xs text-[#0032C8] flex items-center gap-1 mt-1"
            >
              <Plus size={11} />Thêm cột
            </button>
          </div>
        </div>
      )}

      {/* Fee Template Grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#F5F7FB]">
              <th className="px-4 py-3 text-left font-semibold text-[#14183A] border-b border-r border-gray-200 whitespace-nowrap w-36 sticky left-0 bg-[#F5F7FB] z-10">
                Loại phí
              </th>
              {cols.map((col, ci) => (
                <th key={ci} className="px-3 py-3 text-center font-semibold text-[#14183A] border-b border-r border-gray-200 last:border-r-0 min-w-[130px] whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="px-4 py-2 font-semibold text-[#14183A] border-r border-b border-gray-200 bg-[#F5F7FB] whitespace-nowrap sticky left-0 z-10">
                  {row}
                </td>
                {cols.map((col) => {
                  const k = `${row}|||${col}`
                  const cell = assignments[k]
                  const over = dragOver === k
                  return (
                    <td
                      key={col}
                      onDragOver={e => { e.preventDefault(); setDragOver(k) }}
                      onDragLeave={() => setDragOver(prev => prev === k ? null : prev)}
                      onDrop={() => handleDrop(row, col)}
                      className={`px-2 py-2 border-r border-b border-gray-200 last:border-r-0 transition-colors ${over ? 'bg-blue-50' : ''}`}
                    >
                      {cell ? (
                        <div className="relative group rounded-lg p-2 text-center border border-gray-200 bg-white">
                          <button
                            onClick={() => removeSlot(row, col)}
                            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 rounded-full bg-red-400 text-white items-center justify-center"
                          >
                            <XIcon size={8} />
                          </button>
                          <div className="font-semibold text-[#14183A] text-xs leading-tight">{cell.raw}</div>
                          <div className="text-[9px] text-gray-400 truncate mt-0.5">{cell.label}</div>
                        </div>
                      ) : (
                        <div className={`rounded-lg p-2 text-center text-[10px] border border-dashed min-h-[44px] flex items-center justify-center transition-colors ${over ? 'border-[#0032C8] text-[#0032C8] bg-blue-50' : 'border-gray-200 text-gray-300'}`}>
                          {over ? 'Thả vào đây' : '—'}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fee.source_section && (
        <p className="text-[10px] text-gray-400">Nguồn: {fee.source_section}</p>
      )}
      {(fee.notes ?? []).length > 0 && (
        <div className="text-[10px] text-gray-500 bg-gray-50 rounded-lg p-2 space-y-0.5">
          {(fee.notes ?? []).map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      )}
    </div>
  )
}

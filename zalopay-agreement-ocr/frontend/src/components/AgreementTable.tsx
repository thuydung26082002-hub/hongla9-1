import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Agreement } from '../types/agreement'
import StatusChip from './StatusChip'

interface Props {
  agreements: Agreement[]
  loading: boolean
  total: number
  page: number
  pages: number
  onRefresh: () => void
  onPageChange: (p: number) => void
  onReview: (ag: Agreement) => void
}

function ConfBar({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-[#6B7280] text-xs">—</span>
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? '#00CC66' : pct >= 50 ? '#F5A623' : '#E5484D'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
    </div>
  )
}

export default function AgreementTable({ agreements, loading, total, page, pages, onRefresh, onPageChange, onReview }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-[#1A1F36]">
          Danh sách hồ sơ
          <span className="ml-2 text-sm font-normal text-gray-400">({total} hồ sơ)</span>
        </h2>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-sm text-[#0030CC] hover:text-[#0033CC] font-medium"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-[#6B7280] text-xs uppercase tracking-wide">
              <th className="px-6 py-3 text-left font-semibold">Mã Agreement</th>
              <th className="px-6 py-3 text-left font-semibold">Tên Merchant</th>
              <th className="px-6 py-3 text-left font-semibold">App/Payment</th>
              <th className="px-6 py-3 text-left font-semibold">Trạng thái</th>
              <th className="px-6 py-3 text-left font-semibold">Ngày tạo</th>
              <th className="px-6 py-3 text-left font-semibold">Độ tin cậy</th>
              <th className="px-6 py-3 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {agreements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-[#6B7280]">
                  {loading ? 'Đang tải…' : 'Chưa có hồ sơ nào. Upload hợp đồng để bắt đầu.'}
                </td>
              </tr>
            )}
            {agreements.map((ag) => (
              <tr key={ag.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-[#0030CC]">
                  {ag.ma_agreement ?? <span className="text-[#6B7280]">—</span>}
                </td>
                <td className="px-6 py-4 font-medium">{ag.ten_doi_tac ?? '—'}</td>
                <td className="px-6 py-4 text-[#6B7280]">{ag.app_payment_channel ?? '—'}</td>
                <td className="px-6 py-4"><StatusChip status={ag.status} /></td>
                <td className="px-6 py-4 text-[#6B7280] text-xs">
                  {new Date(ag.created_at).toLocaleString('vi-VN')}
                </td>
                <td className="px-6 py-4"><ConfBar value={ag.confidence_avg} /></td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onReview(ag)}
                    className="bg-[#0030CC] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#0033CC] transition-colors"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-[#6B7280] text-xs">
            Trang {page} / {pages} · {total} hồ sơ
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-[#1A1F36]"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              // Show first, last, current±1, and ellipsis
              const p = pages <= 7 ? i + 1 : (() => {
                if (i === 0) return 1
                if (i === 6) return pages
                if (page <= 4) return i + 1
                if (page >= pages - 3) return pages - 6 + i
                return page - 3 + i
              })()
              const isEllipsis = pages > 7 && (
                (i === 1 && p > 2) || (i === 5 && p < pages - 1)
              )
              if (isEllipsis) return (
                <span key={`e${i}`} className="px-2 text-gray-400">…</span>
              )
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    p === page
                      ? 'bg-[#0030CC] text-white'
                      : 'hover:bg-gray-100 text-[#1A1F36]'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pages}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-[#1A1F36]"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import type { FeeGroup } from '../types/agreement'

const VI_CHANNELS = ['Ví ZaloPay (Balance)', 'ATM', 'TK ngân hàng', 'VietQR', 'TKTS', 'Số dư sinh lời', 'CC (trong nước)', 'CC (nước ngoài)']
const CONG_CHANNELS = ['ATM', 'TK ngân hàng', 'VietQR', 'TKTS', 'Số dư sinh lời', 'CC (trong nước)', 'CC (nước ngoài)']

function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('vi-VN')
}

interface FeeTableProps {
  data: FeeGroup
  showRefund?: boolean
}

function GroupTable({ title, channels, data, showRefund }: {
  title: string
  channels: string[]
  data: Record<string, { so_tien_vnd?: number | null; phan_tram?: number | null; min?: number | null; max?: number | null; hoan_phi_co_dinh?: string | null; hoan_phi_phan_tram?: string | null }>
  showRefund: boolean
}) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-bold text-[#0030CC] uppercase tracking-wide bg-blue-50 px-3 py-1.5 rounded-t-lg border border-blue-100">
        {title}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-gray-100 border-t-0">
          <thead className="bg-gray-50 text-[#6B7280]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold border-r border-gray-100">Kênh thanh toán</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-gray-100">Số tiền (VND)</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-gray-100">%</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-gray-100">Min</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-gray-100">Max</th>
              {showRefund && <>
                <th className="px-3 py-2 text-center font-semibold border-r border-gray-100">Hoàn phí cố định</th>
                <th className="px-3 py-2 text-center font-semibold">Hoàn phí %</th>
              </>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {channels.map(ch => {
              const row = data[ch] ?? {}
              return (
                <tr key={ch} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-[#1A1F36] border-r border-gray-100 whitespace-nowrap">{ch}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">{fmt(row.so_tien_vnd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">
                    {row.phan_tram != null ? `${row.phan_tram}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">{fmt(row.min)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${showRefund ? 'border-r border-gray-100' : ''}`}>{fmt(row.max)}</td>
                  {showRefund && <>
                    <td className="px-3 py-2 text-center border-r border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.hoan_phi_co_dinh === 'YES' ? 'bg-green-100 text-green-700' : row.hoan_phi_co_dinh === 'NO' ? 'bg-gray-100 text-gray-500' : 'text-gray-300'}`}>
                        {row.hoan_phi_co_dinh ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.hoan_phi_phan_tram === 'YES' ? 'bg-green-100 text-green-700' : row.hoan_phi_phan_tram === 'NO' ? 'bg-gray-100 text-gray-500' : 'text-gray-300'}`}>
                        {row.hoan_phi_phan_tram ?? '—'}
                      </span>
                    </td>
                  </>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FeeTable({ data, showRefund = false }: FeeTableProps) {
  return (
    <div className="space-y-2">
      <GroupTable
        title="Ví ZaloPay (8 kênh)"
        channels={VI_CHANNELS}
        data={data.vi_zalopay ?? {}}
        showRefund={showRefund}
      />
      <GroupTable
        title="Cổng ZaloPay (7 kênh)"
        channels={CONG_CHANNELS}
        data={data.cong_zalopay ?? {}}
        showRefund={showRefund}
      />
    </div>
  )
}

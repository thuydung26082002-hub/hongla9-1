import type { AgreementStatus } from '../types/agreement'

const MAP: Record<AgreementStatus, string> = {
  'Đang xử lý OCR': 'bg-blue-100 text-blue-700',
  'Chờ duyệt': 'bg-yellow-100 text-yellow-700',
  'Đã duyệt': 'bg-[#00CC66]/10 text-[#00CC66]',
  'Từ chối': 'bg-red-100 text-red-700',
  'Đã kích hoạt': 'bg-[#0030CC]/10 text-[#0030CC]',
}

export default function StatusChip({ status }: { status: AgreementStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${MAP[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

import { useState, useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import type { Agreement, ExtractedData, AuditLog } from '../types/agreement'
import AiField from './AiField'
import FeeTable from './FeeTable'
import StatusChip from './StatusChip'

interface Props {
  agreement: Agreement
  onClose: () => void
  onApprove: () => Promise<void>
  onReject: (note: string) => Promise<void>
  onActivate: () => Promise<void>
  onSave: (data: ExtractedData) => Promise<void>
  auditLogs: AuditLog[]
  role: 'Sales' | 'Kế toán'
}

export default function ReviewModal({ agreement, onClose, onApprove, onReject, onActivate, onSave, auditLogs, role }: Props) {
  const [tab, setTab] = useState<'partner' | 'payment' | 'fee' | 'audit'>('partner')
  const [data, setData] = useState<ExtractedData>(agreement.reviewed_data ?? agreement.ai_extracted_data ?? {} as ExtractedData)
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectBox, setShowRejectBox] = useState(false)
  const [confirm, setConfirm] = useState<{ action: string; label: string; onConfirm: () => void } | null>(null)
  const [saving, setSaving] = useState(false)

  const conf = agreement.ai_extracted_data?._meta?.field_confidence ?? {}
  const ocrError = agreement.ai_extracted_data?._meta?.ocr_error

  const patchPartner = (key: string, v: string) =>
    setData(d => ({ ...d, partner: { ...d.partner, [key]: v } }))
  const patchPayment = (key: string, v: string) =>
    setData(d => ({ ...d, payment: { ...d.payment, [key]: v } }))
  const patchMeta = (key: string, v: string) =>
    setData(d => ({ ...d, fee: { ...d.fee, metadata: { ...d.fee?.metadata, [key]: v } } }))

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(data) } finally { setSaving(false) }
  }

  const canApprove = agreement.status === 'Chờ duyệt' && role === 'Kế toán'
  const canReject = agreement.status === 'Chờ duyệt' && role === 'Kế toán'
  const canActivate = agreement.status === 'Đã duyệt' && role === 'Kế toán'

  const p = data.partner ?? {}
  const pay = data.payment ?? {}
  const meta = data.fee?.metadata ?? {}

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-4xl bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-[#1A1F36] text-lg">
              {p.ten_doi_tac ?? 'Hồ sơ'} <span className="font-mono text-sm text-[#6B7280]">{p.ma_agreement}</span>
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusChip status={agreement.status} />
              {agreement.needs_review === 1 && (
                <span className="text-xs text-[#F5A623] flex items-center gap-0.5">
                  <AlertTriangle size={12} /> Cần review thủ công
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#1A1F36]"><X size={20} /></button>
        </div>

        {/* OCR error banner */}
        {ocrError && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle size={12} /> OCR thất bại: {ocrError} — vui lòng nhập tay.
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 gap-0">
          {[
            { key: 'partner', label: 'Đối tác' },
            { key: 'payment', label: 'Thanh toán' },
            { key: 'fee', label: 'Biểu phí' },
            { key: 'audit', label: `Lịch sử (${auditLogs.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key ? 'border-[#0030CC] text-[#0030CC]' : 'border-transparent text-[#6B7280] hover:text-[#1A1F36]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tab 1: Partner */}
          {tab === 'partner' && (
            <div className="grid grid-cols-2 gap-3">
              <AiField label="Tên đối tác / Merchant" value={p.ten_doi_tac} confidence={conf['partner.ten_doi_tac']} onChange={v => patchPartner('ten_doi_tac', v)} />
              <AiField label="Mã số thuế" value={p.ma_so_thue} confidence={conf['partner.ma_so_thue']} onChange={v => patchPartner('ma_so_thue', v)} />
              <AiField label="Địa chỉ xuất hóa đơn" value={p.dia_chi_xuat_hoa_don} confidence={conf['partner.dia_chi_xuat_hoa_don']} onChange={v => patchPartner('dia_chi_xuat_hoa_don', v)} />
              <AiField label="Mã Agreement" value={p.ma_agreement} confidence={conf['partner.ma_agreement']} onChange={v => patchPartner('ma_agreement', v)} />
              <AiField label="App / Payment Channel" value={p.app_payment_channel} confidence={conf['partner.app_payment_channel']} onChange={v => patchPartner('app_payment_channel', v)} />
              <AiField label="Ngày ký" value={p.ngay_ky} confidence={conf['partner.ngay_ky']} onChange={v => patchPartner('ngay_ky', v)} />
              <AiField label="Ngày bắt đầu tính phí" value={p.ngay_bat_dau_tinh_phi} confidence={conf['partner.ngay_bat_dau_tinh_phi']} onChange={v => patchPartner('ngay_bat_dau_tinh_phi', v)} />
            </div>
          )}

          {/* Tab 2: Payment */}
          {tab === 'payment' && (
            <div className="grid grid-cols-2 gap-3">
              <AiField label="Số tài khoản" value={pay.so_tai_khoan} confidence={conf['payment.so_tai_khoan']} onChange={v => patchPayment('so_tai_khoan', v)} />
              <AiField label="Tên chủ tài khoản" value={pay.ten_chu_tai_khoan} confidence={conf['payment.ten_chu_tai_khoan']} onChange={v => patchPayment('ten_chu_tai_khoan', v)} />
              <AiField label="Ngân hàng thụ hưởng" value={pay.ngan_hang_thu_huong} confidence={conf['payment.ngan_hang_thu_huong']} onChange={v => patchPayment('ngan_hang_thu_huong', v)} />
              <AiField label="Chi nhánh" value={pay.chi_nhanh} confidence={conf['payment.chi_nhanh']} onChange={v => patchPayment('chi_nhanh', v)} />
            </div>
          )}

          {/* Tab 3: Fee schedule */}
          {tab === 'fee' && (
            <div>
              {/* Metadata */}
              <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <AiField label="Thuế VAT" value={meta.thue_vat} onChange={v => patchMeta('thue_vat', v)} />
                <AiField label="Loại công thức" value={meta.loai_cong_thuc} onChange={v => patchMeta('loai_cong_thuc', v)} />
                <AiField label="Thời gian hoàn tiền tối đa (ngày)" value={meta.thoi_gian_hoan_tien_toi_da_ngay} onChange={v => patchMeta('thoi_gian_hoan_tien_toi_da_ngay', v)} />
                <AiField label="Ngày bắt đầu tính phí" value={meta.ngay_bat_dau_tinh_phi} onChange={v => patchMeta('ngay_bat_dau_tinh_phi', v)} />
                <AiField label="Tên Agreement" value={meta.ten_agreement} onChange={v => patchMeta('ten_agreement', v)} />
                <AiField label="Mã Agreement" value={meta.ma_agreement} onChange={v => patchMeta('ma_agreement', v)} />
              </div>

              {data.fee?.phi_giao_dich && (
                <section className="mb-6">
                  <h3 className="font-bold text-[#1A1F36] mb-3 flex items-center gap-2">
                    <span className="w-2 h-4 bg-[#0030CC] rounded-sm inline-block" />
                    Phí giao dịch
                  </h3>
                  <FeeTable data={data.fee.phi_giao_dich} showRefund={false} />
                </section>
              )}

              {data.fee?.phi_hoan_tien && (
                <section>
                  <h3 className="font-bold text-[#1A1F36] mb-3 flex items-center gap-2">
                    <span className="w-2 h-4 bg-[#00CC66] rounded-sm inline-block" />
                    Phí hoàn tiền
                  </h3>
                  <FeeTable data={data.fee.phi_hoan_tien} showRefund={true} />
                </section>
              )}
            </div>
          )}

          {/* Tab 4: Audit log */}
          {tab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 && <p className="text-[#6B7280] text-sm">Chưa có lịch sử thao tác.</p>}
              {auditLogs.map(log => (
                <div key={log.id} className="border border-gray-100 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[#1A1F36]">{log.action}</span>
                    <span className="text-[#6B7280]">{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="text-[#6B7280]">
                    <span className="font-medium text-[#0030CC]">{log.actor}</span>
                    {log.field_name && <> · field: <code className="bg-gray-100 px-1 rounded">{log.field_name}</code></>}
                    {log.ai_value && <> · AI: <span className="text-[#F5A623]">{log.ai_value}</span></>}
                    {log.old_value && <> → <span className="line-through">{log.old_value}</span></>}
                    {log.new_value && <> → <span className="text-[#00CC66] font-medium">{log.new_value}</span></>}
                    {log.note && <div className="mt-1 italic">{log.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reject note box */}
        {showRejectBox && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-200">
            <label className="text-xs font-semibold text-red-700 block mb-1">Lý do từ chối (bắt buộc)</label>
            <textarea
              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
              rows={2}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Nhập lý do từ chối…"
            />
          </div>
        )}

        {/* Confirmation dialog */}
        {confirm && (
          <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-200 flex items-center justify-between">
            <span className="text-sm font-medium text-[#1A1F36]">Xác nhận: <strong>{confirm.label}</strong>?</span>
            <div className="flex gap-2">
              <button onClick={() => { confirm.onConfirm(); setConfirm(null) }} className="bg-[#0030CC] text-white text-sm px-4 py-1.5 rounded-lg font-medium">Xác nhận</button>
              <button onClick={() => setConfirm(null)} className="text-[#6B7280] text-sm px-3 py-1.5">Hủy</button>
            </div>
          </div>
        )}

        {/* Sticky action bar */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
          <button
            onClick={() => setConfirm({ action: 'save', label: 'Lưu nháp dữ liệu', onConfirm: handleSave })}
            className="border border-gray-200 text-sm font-medium px-4 py-2 rounded-lg text-[#1A1F36] hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            {saving ? 'Đang lưu…' : 'Lưu nháp'}
          </button>

          <div className="flex gap-2">
            {canReject && !showRejectBox && (
              <button
                onClick={() => setShowRejectBox(true)}
                className="bg-[#E5484D] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
              >
                Từ chối
              </button>
            )}
            {canReject && showRejectBox && (
              <button
                onClick={() => {
                  if (!rejectNote.trim()) return alert('Vui lòng nhập lý do từ chối')
                  setConfirm({ action: 'reject', label: `Từ chối: "${rejectNote}"`, onConfirm: () => onReject(rejectNote) })
                  setShowRejectBox(false)
                }}
                className="bg-[#E5484D] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
              >
                Xác nhận từ chối
              </button>
            )}
            {canApprove && (
              <button
                onClick={() => setConfirm({ action: 'approve', label: 'Phê duyệt hồ sơ', onConfirm: onApprove })}
                className="bg-[#00CC66] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
              >
                Phê duyệt
              </button>
            )}
            {canActivate && (
              <button
                onClick={() => setConfirm({ action: 'activate', label: 'Kích hoạt và push sang hệ thống chính thức', onConfirm: onActivate })}
                className="bg-[#0030CC] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#0033CC] transition-colors"
              >
                Kích hoạt
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

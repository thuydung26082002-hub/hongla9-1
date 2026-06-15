import { useState, useRef } from 'react'
import { CheckCircle, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react'

interface FieldLech {
  kenh: string
  loai_field: string
  gia_tri_excel: string
  gia_tri_ky_vong: string
  chenh_lech: string
  ghi_chu: string
}

interface TuKhoaExcel {
  kenh: string
  co_mo: boolean
  phi_gd: string
  phi_hoan: string
  ro_phi: string
  la_kenh_dac_biet: boolean
  ky_vong_pct_str: string
  khop_pct: boolean
}

interface ReconcileResult {
  error?: string
  merchant?: { ma_agreement: string; ten_merchant: string; ma_so_thue: string; trang_thai: string }
  vat?: {
    hop_dong_bao_gom_vat: boolean | null
    excel_co_j: string
    excel_co_so_vat: string
    da_chuan_hoa_hop_dong: boolean
    da_chuan_hoa_excel: boolean | null
  }
  tu_khoa_excel?: TuKhoaExcel[]
  so_sanh?: { tong_field_so_sanh: number; so_field_khop: number; ty_le_khop_phan_tram: number }
  field_lech?: FieldLech[]
  canh_bao?: string[]
  de_xuat?: 'DUYỆT' | 'REVIEW' | 'TỪ CHỐI'
  ly_do_de_xuat?: string
  luu_y?: string
}

interface Props {
  agreementId: string
}

export default function ReconcileTab({ agreementId }: Props) {
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/agreements/${agreementId}/reconcile`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: `Lỗi kết nối: ${e}` })
    } finally {
      setLoading(false)
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const deXuatStyle = (de: string) => {
    if (de === 'DUYỆT')    return 'bg-green-100 text-green-700 border-green-300'
    if (de === 'REVIEW')   return 'bg-yellow-100 text-yellow-700 border-yellow-300'
    return 'bg-red-100 text-red-700 border-red-300'
  }

  const deXuatIcon = (de: string) => {
    if (de === 'DUYỆT')    return <CheckCircle size={18} className="text-green-600" />
    if (de === 'REVIEW')   return <AlertTriangle size={18} className="text-yellow-600" />
    return <XCircle size={18} className="text-red-600" />
  }

  const tyLeColor = (t: number) => {
    if (t >= 90) return 'text-green-600'
    if (t >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="space-y-5">
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-[#0032C8] hover:bg-blue-50 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
        <FileSpreadsheet size={32} className="mx-auto mb-2 text-[#0032C8]" />
        <p className="text-sm font-semibold text-[#1A1F36]">
          {fileName ? fileName : 'Kéo thả hoặc click để chọn file Excel'}
        </p>
        <p className="text-xs text-gray-400 mt-1">Sheet "Phí thường" · .xlsx / .xls</p>
        {loading && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[#0032C8]">
            <div className="w-4 h-4 border-2 border-[#0032C8] border-t-transparent rounded-full animate-spin" />
            Đang đối soát…
          </div>
        )}
      </div>

      {/* Error */}
      {result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          {result.error}
        </div>
      )}

      {/* Results */}
      {result && !result.error && result.so_sanh && (
        <>
          {/* Score card */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Tỷ lệ khớp</p>
              <p className={`text-4xl font-bold ${tyLeColor(result.so_sanh.ty_le_khop_phan_tram)}`}>
                {result.so_sanh.ty_le_khop_phan_tram}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {result.so_sanh.so_field_khop} / {result.so_sanh.tong_field_so_sanh} fields khớp
              </p>
            </div>
            <div className={`border rounded-xl p-4 flex flex-col items-center justify-center gap-2 ${deXuatStyle(result.de_xuat!)}`}>
              {deXuatIcon(result.de_xuat!)}
              <span className="text-lg font-bold">{result.de_xuat}</span>
            </div>
          </div>

          {/* Merchant + VAT info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-gray-700">Merchant trong Excel</p>
              <p className="text-gray-600">{result.merchant?.ten_merchant}</p>
              <p className="text-gray-400">Agreement: {result.merchant?.ma_agreement}</p>
              <p className="text-gray-400">Trạng thái: {result.merchant?.trang_thai}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-gray-700">Cơ sở VAT</p>
              <p className="text-gray-600">
                HĐ: {result.vat?.hop_dong_bao_gom_vat === true ? '✓ Đã gồm VAT' :
                       result.vat?.hop_dong_bao_gom_vat === false ? '✗ Chưa gồm VAT' : 'Không rõ'}
              </p>
              <p className="text-gray-600">
                Excel cột J: <span className="font-mono font-bold">{result.vat?.excel_co_j}</span>
                {' '}— {result.vat?.excel_co_so_vat}
              </p>
              {result.vat?.da_chuan_hoa_hop_dong && (
                <p className="text-blue-600 font-medium">✓ Đã chuẩn hóa VAT phía HĐ</p>
              )}
              {result.vat?.da_chuan_hoa_excel && (
                <p className="text-blue-600 font-medium">✓ Đã chuẩn hóa VAT phía Excel (÷1.1)</p>
              )}
            </div>
          </div>

          {/* Field lệch */}
          {(result.field_lech?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                Field lệch ({result.field_lech!.length})
              </p>
              <div className="overflow-x-auto rounded-xl border border-red-100">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-red-50 text-red-700">
                      {['Kênh', 'Field', 'Excel', 'Kỳ vọng HĐ', 'Chênh lệch', 'Ghi chú'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold border-b border-red-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.field_lech!.map((f, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-red-50/40">
                        <td className="px-3 py-2 font-medium text-[#14183A]">{f.kenh}</td>
                        <td className="px-3 py-2 text-gray-600">{f.loai_field}</td>
                        <td className="px-3 py-2 font-mono text-red-600">{f.gia_tri_excel}</td>
                        <td className="px-3 py-2 font-mono text-green-700">{f.gia_tri_ky_vong}</td>
                        <td className="px-3 py-2 font-mono text-orange-600 font-semibold">{f.chenh_lech}</td>
                        <td className="px-3 py-2 text-gray-400 italic">{f.ghi_chu}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cảnh báo */}
          {(result.canh_bao?.length ?? 0) > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-700 flex items-center gap-1">
                <AlertTriangle size={12} />Cảnh báo ({result.canh_bao!.length})
              </p>
              {result.canh_bao!.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700">• {w}</p>
              ))}
            </div>
          )}

          {/* Lý do + lưu ý */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>{result.ly_do_de_xuat}</p>
            <p className="italic text-gray-400">{result.luu_y}</p>
          </div>

          {/* DEBUG TABLE — tắt sau khi debug xong */}
          {(result.tu_khoa_excel?.length ?? 0) > 0 && (
            <details className="mt-2">
              <summary className="text-xs font-semibold text-gray-400 cursor-pointer select-none uppercase tracking-wide">
                Debug — Số liệu thô ({result.tu_khoa_excel!.filter(k => k.co_mo).length} kênh đang mở)
              </summary>
              <div className="overflow-x-auto rounded-lg border border-gray-200 mt-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      {['Kênh', 'Rổ', 'Excel %', 'Kỳ vọng HĐ', 'Khớp'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-semibold border-b border-gray-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.tu_khoa_excel!.filter(k => k.co_mo).map((k, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1 font-medium text-[#14183A]">
                          {k.kenh}
                          {k.la_kenh_dac_biet && <span className="ml-1 text-[10px] text-blue-500">★</span>}
                        </td>
                        <td className="px-2 py-1 text-gray-500 font-mono text-[11px]">{k.ro_phi}</td>
                        <td className="px-2 py-1 font-mono">{k.phi_gd || '—'}</td>
                        <td className="px-2 py-1 font-mono text-green-700">{k.ky_vong_pct_str || '—'}</td>
                        <td className="px-2 py-1 text-center">
                          {k.khop_pct
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500 font-bold">✗</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

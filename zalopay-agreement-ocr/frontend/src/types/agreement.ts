export type AgreementStatus =
  | 'Đang xử lý OCR'
  | 'Chờ duyệt'
  | 'Đã duyệt'
  | 'Từ chối'
  | 'Đã kích hoạt'

export interface FeeChannel {
  so_tien_vnd?: number | null
  phan_tram?: number | null
  min?: number | null
  max?: number | null
  hoan_phi_co_dinh?: string | null
  hoan_phi_phan_tram?: string | null
}

export interface FeeGroup {
  vi_zalopay: Record<string, FeeChannel>
  cong_zalopay: Record<string, FeeChannel>
}

export interface ExtractedData {
  partner: {
    ten_doi_tac?: string | null
    ma_so_thue?: string | null
    dia_chi_xuat_hoa_don?: string | null
    ma_agreement?: string | null
    app_payment_channel?: string | null
    ngay_ky?: string | null
    ngay_bat_dau_tinh_phi?: string | null
  }
  payment: {
    so_tai_khoan?: string | null
    ten_chu_tai_khoan?: string | null
    ngan_hang_thu_huong?: string | null
    chi_nhanh?: string | null
  }
  fee: {
    metadata: {
      stt?: number | null
      ma_agreement?: string | null
      ten_agreement?: string | null
      trang_thai_agreement?: string
      ten_merchant?: string | null
      app_payment?: string | null
      thoi_gian_hoan_tien_toi_da_ngay?: number | null
      ngay_bat_dau_tinh_phi?: string | null
      ngay_duyet_agreement?: string | null
      thue_vat?: string | null
      loai_cong_thuc?: string | null
    }
    phi_giao_dich: FeeGroup
    phi_hoan_tien: FeeGroup
    cong_thuc_dac_biet?: Record<string, unknown>
  }
  _meta?: {
    field_confidence?: Record<string, number>
    needs_review?: boolean
    ocr_error?: string
  }
}

export interface Agreement {
  id: string
  ma_agreement?: string | null
  ten_doi_tac?: string | null
  app_payment_channel?: string | null
  status: AgreementStatus
  ai_extracted_data?: ExtractedData | null
  reviewed_data?: ExtractedData | null
  confidence_avg?: number | null
  needs_review: number
  rejection_note?: string | null
  source_file_name?: string | null
  created_at: string
  updated_at: string
  approved_by?: string | null
  approved_at?: string | null
}

export interface AuditLog {
  id: number
  agreement_id: string
  actor: string
  action: string
  field_name?: string | null
  old_value?: string | null
  new_value?: string | null
  ai_value?: string | null
  note?: string | null
  created_at: string
}

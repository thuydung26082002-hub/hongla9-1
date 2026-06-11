const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Trigger' },
  { id: 3, label: 'OCR & Trích xuất' },
  { id: 4, label: 'Tạo hồ sơ' },
  { id: 5, label: 'Review & Duyệt' },
  { id: 6, label: 'Kích hoạt' },
]

export default function Stepper({ active }: { active: number }) {
  return (
    <div className="bg-white border-b border-gray-100 py-4">
      <div className="max-w-7xl mx-auto px-6">
        <ol className="flex items-center gap-0">
          {STEPS.map((step, i) => {
            const done = step.id < active
            const current = step.id === active
            return (
              <li key={step.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                      ${done ? 'bg-[#00CC66] text-white' : current ? 'bg-[#0030CC] text-white ring-4 ring-blue-100' : 'bg-gray-100 text-[#6B7280]'}`}
                  >
                    {done ? '✓' : step.id}
                  </div>
                  <span className={`text-xs whitespace-nowrap font-medium ${current ? 'text-[#0030CC]' : done ? 'text-[#00CC66]' : 'text-[#6B7280]'}`}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-5 ${done ? 'bg-[#00CC66]' : 'bg-gray-200'}`} />
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

type Role = 'Sales' | 'Kế toán'

export default function Header({ role, onRoleChange }: { role: Role; onRoleChange: (r: Role) => void }) {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="bg-[#0030CC] rounded-lg w-9 h-9 flex items-center justify-center">
            <span className="text-white font-bold text-sm">Z</span>
          </div>
          <span>
            <span className="font-bold text-xl text-[#0030CC]">Zalo</span>
            <span className="font-bold text-xl text-[#00CC66]">Pay</span>
          </span>
          <span className="ml-3 text-[#6B7280] text-sm font-medium border-l pl-3 border-gray-200">
            Cổng tạo hồ sơ Đối tác tự động
          </span>
        </div>

        {/* Role badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B7280]">Đăng nhập với vai trò:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            {(['Sales', 'Kế toán'] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                className={`px-3 py-1.5 transition-colors ${
                  role === r
                    ? 'bg-[#0030CC] text-white'
                    : 'bg-white text-[#6B7280] hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

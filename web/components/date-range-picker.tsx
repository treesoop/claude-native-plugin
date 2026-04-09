'use client';

interface DateRangePickerProps {
  value: 'today' | 'week' | 'month';
  onChange: (value: 'today' | 'week' | 'month') => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const options = [
    { key: 'today' as const, label: '오늘' },
    { key: 'week' as const, label: '이번 주' },
    { key: 'month' as const, label: '이번 달' },
  ];

  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-4 py-2 rounded-lg text-sm ${
            value === opt.key
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

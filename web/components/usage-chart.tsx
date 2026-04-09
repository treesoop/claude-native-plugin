'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface UsageChartProps {
  data: { date: string; inputTokens: number; outputTokens: number }[];
}

export function UsageChart({ data }: UsageChartProps) {
  return (
    <div className="bg-white rounded-xl p-4 border">
      <h3 className="text-sm font-medium text-gray-500 mb-4">일별 토큰 사용량</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="inputTokens" name="Input" fill="#6366f1" stackId="tokens" />
          <Bar dataKey="outputTokens" name="Output" fill="#a5b4fc" stackId="tokens" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

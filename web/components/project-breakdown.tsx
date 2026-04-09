'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ProjectBreakdownProps {
  data: { project: string; tokens: number }[];
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

export function ProjectBreakdown({ data }: ProjectBreakdownProps) {
  return (
    <div className="bg-white rounded-xl p-4 border">
      <h3 className="text-sm font-medium text-gray-500 mb-4">프로젝트별 사용량</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey="tokens" nameKey="project" cx="50%" cy="50%" outerRadius={100} label>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

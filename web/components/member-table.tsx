import { Member } from '@/lib/types';

interface MemberTableProps {
  members: (Member & { inputTokens: number; outputTokens: number; promptCount: number })[];
}

export function MemberTable({ members }: MemberTableProps) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">이름</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Input Tokens</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Output Tokens</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">프롬프트</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3 text-sm">{m.name}</td>
              <td className="px-4 py-3 text-sm text-right">{m.inputTokens.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right">{m.outputTokens.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-right">{m.promptCount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

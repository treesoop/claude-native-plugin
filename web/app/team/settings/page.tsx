'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Team, Member } from '@/lib/types';

function generateInviteKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'tk_';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export default function TeamSettingsPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamName, setTeamName] = useState('');
  const [memberName, setMemberName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1);

    if (teams && teams.length > 0) {
      setTeam(teams[0]);
      const { data: mems } = await supabase
        .from('members')
        .select('*')
        .eq('team_id', teams[0].id);
      setMembers(mems || []);
    }
  }

  async function createTeam() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !teamName) return;
    await supabase.from('teams').insert({ name: teamName, owner_id: user.id });
    await loadData();
    setTeamName('');
  }

  async function addMember() {
    if (!team || !memberName) return;
    const inviteKey = generateInviteKey();
    await supabase.from('members').insert({
      team_id: team.id,
      invite_key: inviteKey,
      name: memberName,
    });
    await loadData();
    setMemberName('');
  }

  async function deleteMember(id: string) {
    await supabase.from('members').delete().eq('id', id);
    await loadData();
  }

  if (!team) {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">팀 생성</h1>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="팀 이름"
          className="border rounded-lg px-4 py-2 w-full mb-4"
        />
        <button onClick={createTeam} className="bg-gray-900 text-white px-6 py-2 rounded-lg w-full">
          생성
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{team.name} — 설정</h1>

      <div className="bg-white rounded-xl border p-4">
        <h2 className="font-medium mb-4">팀원 추가</h2>
        <div className="flex gap-2">
          <input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="팀원 이름"
            className="border rounded-lg px-4 py-2 flex-1"
          />
          <button onClick={addMember} className="bg-gray-900 text-white px-6 py-2 rounded-lg">
            추가
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">이름</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Invite Key</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-sm">{m.name}</td>
                <td className="px-4 py-3 text-sm font-mono text-xs">{m.invite_key}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <button
                    onClick={() => navigator.clipboard.writeText(m.invite_key)}
                    className="text-blue-600 hover:underline mr-3"
                  >
                    복사
                  </button>
                  <button
                    onClick={() => deleteMember(m.id)}
                    className="text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

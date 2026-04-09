'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Member, UsageEvent } from '@/lib/types';
import { TokenSummary } from '@/components/token-summary';
import { UsageChart } from '@/components/usage-chart';
import { MemberTable } from '@/components/member-table';
import { DateRangePicker } from '@/components/date-range-picker';

function getDateRange(range: 'today' | 'week' | 'month'): string {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export default function TeamPage() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, [range]);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: teams } = await supabase.from('teams').select('*').eq('owner_id', user.id).limit(1);
    if (!teams || teams.length === 0) return;

    const { data: mems } = await supabase.from('members').select('*').eq('team_id', teams[0].id);
    setMembers(mems || []);

    if (mems && mems.length > 0) {
      const keys = mems.map((m) => m.invite_key);
      const from = getDateRange(range);
      const { data: evts } = await supabase
        .from('usage_events')
        .select('*')
        .in('invite_key', keys)
        .gte('timestamp', from)
        .order('timestamp', { ascending: true });
      setEvents(evts || []);
    }
  }

  const endEvents = events.filter((e) => e.event_type === 'session_end');
  const inputTokens = endEvents.reduce((sum, e) => sum + e.input_tokens, 0);
  const outputTokens = endEvents.reduce((sum, e) => sum + e.output_tokens, 0);
  const promptCount = endEvents.reduce((sum, e) => sum + e.prompt_count, 0);

  const dailyMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const e of endEvents) {
    const date = e.timestamp.slice(0, 10);
    const d = dailyMap.get(date) || { inputTokens: 0, outputTokens: 0 };
    d.inputTokens += e.input_tokens;
    d.outputTokens += e.output_tokens;
    dailyMap.set(date, d);
  }
  const chartData = Array.from(dailyMap.entries()).map(([date, d]) => ({ date, ...d }));

  const memberStats = members.map((m) => {
    const mEvents = endEvents.filter((e) => e.invite_key === m.invite_key);
    return {
      ...m,
      inputTokens: mEvents.reduce((sum, e) => sum + e.input_tokens, 0),
      outputTokens: mEvents.reduce((sum, e) => sum + e.output_tokens, 0),
      promptCount: mEvents.reduce((sum, e) => sum + e.prompt_count, 0),
    };
  });

  const sessions = new Map<string, { start?: string; end?: string }>();
  for (const e of events) {
    const s = sessions.get(e.session_id) || {};
    if (e.event_type === 'session_start') s.start = e.timestamp;
    if (e.event_type === 'session_end') s.end = e.timestamp;
    if (e.event_type === 'heartbeat') {
      if (!s.start) s.start = e.timestamp;
      s.end = e.timestamp;
    }
    sessions.set(e.session_id, s);
  }
  let totalMs = 0;
  for (const s of sessions.values()) {
    if (s.start && s.end) totalMs += new Date(s.end).getTime() - new Date(s.start).getTime();
  }
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">팀 대시보드</h1>
        <div className="flex gap-4">
          <DateRangePicker value={range} onChange={setRange} />
          <a href="/team/settings" className="text-sm text-gray-500 hover:underline self-center">설정</a>
        </div>
      </div>
      <TokenSummary
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        totalTime={`${hours}h ${mins}m`}
        promptCount={promptCount}
      />
      <UsageChart data={chartData} />
      <div>
        <h2 className="text-lg font-medium mb-3">팀원별 사용량</h2>
        <MemberTable members={memberStats} />
      </div>
    </div>
  );
}

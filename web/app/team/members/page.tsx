'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { UsageEvent } from '@/lib/types';
import { TokenSummary } from '@/components/token-summary';
import { UsageChart } from '@/components/usage-chart';
import { ProjectBreakdown } from '@/components/project-breakdown';
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

function MemberDetailContent() {
  const searchParams = useSearchParams();
  const inviteKey = searchParams.get('key');
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [memberName, setMemberName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    if (!inviteKey) return;
    const from = getDateRange(range);

    supabase.from('members').select('name').eq('invite_key', inviteKey).single()
      .then(({ data }) => { if (data) setMemberName(data.name); });

    supabase
      .from('usage_events')
      .select('*')
      .eq('invite_key', inviteKey)
      .gte('timestamp', from)
      .order('timestamp', { ascending: true })
      .then(({ data }) => setEvents(data || []));
  }, [inviteKey, range]);

  if (!inviteKey) return null;

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

  const projectMap = new Map<string, number>();
  for (const e of endEvents) {
    projectMap.set(e.project, (projectMap.get(e.project) || 0) + e.input_tokens + e.output_tokens);
  }
  const projectData = Array.from(projectMap.entries()).map(([project, tokens]) => ({ project, tokens }));

  const sessions = new Map<string, { start?: string; end?: string }>();
  for (const e of events) {
    const s = sessions.get(e.session_id) || {};
    if (e.event_type === 'session_start') s.start = e.timestamp;
    if (e.event_type === 'session_end') s.end = e.timestamp;
    if (e.event_type === 'heartbeat') { if (!s.start) s.start = e.timestamp; s.end = e.timestamp; }
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
        <div>
          <a href="/team" className="text-sm text-gray-500 hover:underline">← 팀 대시보드</a>
          <h1 className="text-2xl font-bold mt-1">{memberName}</h1>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <TokenSummary inputTokens={inputTokens} outputTokens={outputTokens} totalTime={`${hours}h ${mins}m`} promptCount={promptCount} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UsageChart data={chartData} />
        <ProjectBreakdown data={projectData} />
      </div>
    </div>
  );
}

export default function MemberDetailPage() {
  return (
    <Suspense>
      <MemberDetailContent />
    </Suspense>
  );
}

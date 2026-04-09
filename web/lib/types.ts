export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Member {
  id: string;
  team_id: string;
  invite_key: string;
  name: string;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  invite_key: string;
  session_id: string;
  event_type: 'session_start' | 'session_end' | 'heartbeat';
  project: string;
  input_tokens: number;
  output_tokens: number;
  prompt_count: number;
  timestamp: string;
  created_at: string;
}

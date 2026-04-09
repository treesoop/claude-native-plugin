'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('로그인 실패: 이메일 또는 비밀번호를 확인하세요.');
    } else {
      router.push('/team');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleLogin} className="w-80 space-y-4">
        <h1 className="text-2xl font-bold text-center">Task Tracker</h1>
        <p className="text-gray-600 text-center text-sm">팀장 로그인</p>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="border rounded-lg px-4 py-2 w-full"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="border rounded-lg px-4 py-2 w-full"
          required
        />
        <button type="submit" className="bg-gray-900 text-white px-6 py-3 rounded-lg w-full hover:bg-gray-700">
          로그인
        </button>
      </form>
    </div>
  );
}

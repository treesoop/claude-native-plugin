'use client';

import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Task Tracker</h1>
        <p className="text-gray-600 mb-8">Claude Code 사용량 대시보드</p>
        <button
          onClick={handleLogin}
          className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-700"
        >
          GitHub로 로그인
        </button>
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Task Tracker</h1>
        <p className="text-gray-600 mb-8">Claude Code 사용량 추적 대시보드</p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-700"
          >
            팀장 로그인
          </Link>
          <Link
            href="/dashboard"
            className="border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50"
          >
            개인 대시보드
          </Link>
        </div>
      </div>
    </div>
  );
}

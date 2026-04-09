interface TokenSummaryProps {
  inputTokens: number;
  outputTokens: number;
  totalTime: string;
  promptCount: number;
}

export function TokenSummary({ inputTokens, outputTokens, totalTime, promptCount }: TokenSummaryProps) {
  const cards = [
    { label: '사용 시간', value: totalTime },
    { label: 'Input Tokens', value: inputTokens.toLocaleString() },
    { label: 'Output Tokens', value: outputTokens.toLocaleString() },
    { label: '프롬프트 수', value: promptCount.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-xl p-4 border">
          <p className="text-sm text-gray-500">{card.label}</p>
          <p className="text-2xl font-bold mt-1">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

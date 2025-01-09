// src/components/ui/StatusIndicator.tsx

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'away' | 'busy';
  className?: string;
}

export function StatusIndicator({ status, className = '' }: StatusIndicatorProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-[#00b300]';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      case 'offline':
      default:
        return 'bg-zinc-500';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="w-3 h-3 rounded-full bg-zinc-800 flex items-center justify-center">
        <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
      </div>
    </div>
  );
} 
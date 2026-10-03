export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0 sec';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins} min ${secs} sec`;
  }
  return `${secs} sec`;
}

export function formatDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

export function formatListeningTime(minutes: number): string {
  if (isNaN(minutes) || minutes < 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

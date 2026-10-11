import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Root application crash caught by AppErrorBoundary:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#06060b] text-white flex items-center justify-center p-6 z-[999999]">
          <div className="max-w-md w-full p-8 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-2xl text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-2xl">
              🎵
            </div>
            <h1 className="text-xl font-black tracking-tight text-white">WaveCraft Recovered</h1>
            <p className="text-sm text-white/60 leading-relaxed">
              An unexpected render issue occurred. Your saved playlists and audio settings remain safe.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full py-3 rounded-full bg-gradient-to-r from-[#fa2d48] to-[#ff5b79] text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:opacity-90 active:scale-[0.98] transition cursor-pointer"
            >
              Relaunch WaveCraft
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;

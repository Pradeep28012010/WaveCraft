import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MiniPlayer from './MiniPlayer';
import { usePlayerStore } from '../../stores/playerStore';
import AnimatedBackground from '../ui/AnimatedBackground';
import YouTubeEmbed from '../player/YouTubeEmbed';
import { useColorExtract } from '../../hooks/useColorExtract';

export default function MainLayout() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const { colors } = useColorExtract(currentTrack?.thumbnail);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-white bg-black">
      {/* Background layer */}
      <AnimatedBackground colors={colors} />
      
      {/* Hidden YouTube Player */}
      <YouTubeEmbed />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <TopBar />
          
          <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <div className="max-w-7xl mx-auto pb-24">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {currentTrack && <MiniPlayer />}
    </div>
  );
}

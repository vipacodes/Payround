import LoadingScreen from '@/components/LoadingScreen';

// Shown automatically during page transitions — gives the installed app a proper loading animation
export default function Loading() {
  return <LoadingScreen label="Loading PayRound…" />;
}

import { Spinner } from '../components/ui/Spinner';

// Shown while the first lazy route chunk downloads (HydrateFallback) .
export default function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-primary-strong">
      <Spinner label="Loading page" className="h-8 w-8" />
    </div>
  );
}

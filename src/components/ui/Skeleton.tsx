interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
}

const Skeleton = ({
  width,
  height,
  borderRadius,
  className = '',
  variant = 'text'
}: SkeletonProps) => {
  
  let baseStyles = 'shimmer bg-white/5 overflow-hidden ';
  let defaultHeight = '1em';
  let defaultBorderRadius = '0.25rem';

  if (variant === 'circular') {
    defaultBorderRadius = '50%';
  } else if (variant === 'rectangular') {
    defaultHeight = '4rem';
    defaultBorderRadius = 'var(--radius-md)';
  }

  const style = {
    width: width || (variant === 'text' ? '100%' : 'auto'),
    height: height || defaultHeight,
    borderRadius: borderRadius || defaultBorderRadius,
  };

  return <div className={`${baseStyles} ${className}`} style={style} />;
};

export const TrackSkeleton = () => (
  <div className="flex items-center gap-4 py-2 px-2 w-full">
    <Skeleton variant="circular" width="2rem" height="2rem" />
    <Skeleton variant="rectangular" width="3rem" height="3rem" borderRadius="var(--radius-sm)" />
    <div className="flex flex-col gap-2 flex-grow">
      <Skeleton width="40%" height="1rem" />
      <Skeleton width="20%" height="0.8rem" />
    </div>
    <Skeleton width="3rem" height="1rem" className="hidden md:block" />
  </div>
);

export const CardSkeleton = () => (
  <div className="glass-card flex flex-col gap-4">
    <Skeleton variant="rectangular" width="100%" height="12rem" borderRadius="var(--radius-md)" />
    <Skeleton width="80%" height="1.2rem" />
    <Skeleton width="50%" height="0.9rem" />
  </div>
);

export default Skeleton;

import React from 'react';

export function Skeleton({ className = '', variant = 'rect' }) {
  const baseClass = 'skeleton bg-gray-200 dark:bg-gray-700 rounded';
  
  const variants = {
    rect: 'w-full h-4',
    circle: 'w-12 h-12 rounded-full',
    card: 'w-full h-32',
  };
  
  return (
    <div className={`${baseClass} ${variants[variant]} ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="glass p-6 rounded-xl space-y-4 animate-fade-in">
      <div className="flex items-center space-x-3">
        <Skeleton variant="circle" className="w-10 h-10" />
        <Skeleton className="h-6 w-32" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function ListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

import React, { useRef } from 'react';

interface SpotlightSurfaceProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Editorial Architectural Glass Surface with pointer-tracked specular radial spotlight
 * and hairline border sheen.
 */
export const SpotlightSurface: React.FC<SpotlightSurfaceProps> = ({
  children,
  className = '',
  onClick,
  style,
}) => {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    divRef.current.style.setProperty('--mx', `${x}px`);
    divRef.current.style.setProperty('--my', `${y}px`);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onClick={onClick}
      style={{
        background: 'rgba(6, 10, 18, 0.58)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 20px 40px -15px rgba(0, 0, 0, 0.7)',
        ...style,
      }}
      className={`relative group rounded-2xl overflow-hidden transition-all duration-300 ${className}`}
    >
      {/* Specular Radial Spotlight Sheen */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(400px circle at var(--mx, -100px) var(--my, -100px), rgba(0, 245, 212, 0.10), transparent 70%)',
        }}
      />
      {/* Hairline Specular Border Accent */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-cyan-400/25"
        style={{
          maskImage: 'radial-gradient(240px circle at var(--mx, -100px) var(--my, -100px), black, transparent)',
          WebkitMaskImage:
            'radial-gradient(240px circle at var(--mx, -100px) var(--my, -100px), black, transparent)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default SpotlightSurface;

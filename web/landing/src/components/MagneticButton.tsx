import React, { useRef, useState } from 'react';

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  maxDistance?: number;
}

/**
 * Critically damped physical magnetic button that subtly pulls toward
 * the pointer on hover and snaps back on leave (Teenage Engineering & Linear aesthetic).
 */
export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  maxDistance = 14,
  onClick,
  style,
  ...rest
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Respect user's motion preferences
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (e.clientX - centerX) * 0.35;
    const deltaY = (e.clientY - centerY) * 0.35;
    const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (dist > maxDistance) {
      const angle = Math.atan2(deltaY, deltaX);
      setPosition({
        x: Math.cos(angle) * maxDistance,
        y: Math.sin(angle) * maxDistance,
      });
    } else {
      setPosition({ x: deltaX, y: deltaY });
    }
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <button
      ref={btnRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        transition:
          position.x === 0 && position.y === 0
            ? 'transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2)'
            : 'transform 0.08s ease-out',
        ...style,
      }}
      className={`cursor-pointer active:scale-95 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export default MagneticButton;

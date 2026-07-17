import { type FunctionComponent } from 'preact';
import { useThreeRenderer } from '../hooks/use-three-renderer';
import type { ParsedIcon } from '../domain/types';

interface IconRendererProps {
  icon: ParsedIcon;
}

export const IconRenderer: FunctionComponent<IconRendererProps> = ({ icon }) => {
  const { containerRef } = useThreeRenderer({ icon });

  return (
    <div
      ref={containerRef}
      id="icon-3d-container"
      style={{
        width: '100%',
        height: '200px',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--bg-deep)',
      }}
      aria-label="3D save icon preview"
      role="img"
    />
  );
};

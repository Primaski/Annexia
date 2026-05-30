interface SpriteProps {
  imagePath: string | null;
  name: string;
  size: number;
}

export function Sprite({ imagePath, name, size }: SpriteProps) {
  if (imagePath !== null) {
    return (
      <img
        src={imagePath}
        alt={name}
        width={size}
        height={size}
        style={{ borderRadius: '4px', display: 'block' }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#1e2d3a',
        border: '1px solid #2a3f50',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#5a7a8a',
        fontSize: size * 0.4,
        fontFamily: 'monospace',
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

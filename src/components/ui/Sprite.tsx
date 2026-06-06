import { Avatar } from '@dicebear/core';
import definition from '@dicebear/styles/adventurer.json' with { type: 'json' };

interface SpriteProps {
  imagePath: string | null;
  name: string;
  size: number;
  zoom?: number;
  expression?: 'smile' | 'smile-big' | 'frown' | 'frown-big' | 'neutral';
}

const MOUTH_VARIANTS: Record<string, string> = {
  'smile':      'variant02',
  'smile-big':  'variant25',
  'frown':      'variant04',
  'frown-big':  'variant14',
};

export function Sprite({ imagePath, name, size, zoom = 1, expression }: SpriteProps) {
  if (imagePath !== null) {
    const scaled = size * zoom;
    const offset = -((scaled - size) / 2);

    let src = imagePath;
    if (imagePath.includes('dicebear.com') && expression && expression !== 'neutral') {
      const seed = new URL(imagePath).searchParams.get('seed') ?? name;
      const mouthVariant = MOUTH_VARIANTS[expression] ?? 'variant02';
      src = new Avatar(definition, { seed, mouthVariant: [mouthVariant] }).toDataUri();
    }

    return (
      <div
        style={{
          width: size,
          height: size,
          overflow: 'hidden',
          borderRadius: '4px',
          flexShrink: 0,
        }}
      >
        <img
          src={src}
          alt={name}
          width={scaled}
          height={scaled}
          style={{ display: 'block', marginLeft: offset, marginTop: offset }}
        />
      </div>
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

import { Avatar } from '@dicebear/core';
import definition from '@dicebear/styles/adventurer.json';

const variants = Array.from({ length: 30 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return `variant${n}`;
});

export default function MouthPreview() {
  return (
    <div style={{ padding: 24, background: '#1a1a2e', minHeight: '100vh' }}>
      <h2 style={{ color: '#fff', fontFamily: 'monospace', marginBottom: 24 }}>
        Adventurer — mouth variants
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {variants.map((variant) => {
          const uri = new Avatar(definition, {
            seed: 'preview',
            mouthVariant: [variant],
          }).toDataUri();
          return (
            <div
              key={variant}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              <img src={uri} width={80} height={80} alt={variant} />
              <span style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 11 }}>
                {variant}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

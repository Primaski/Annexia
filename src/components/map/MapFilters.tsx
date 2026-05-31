import { useUIStore } from '../../store/uiStore';
import type { TraitVector } from '../../types';

const TRAIT_META: { key: keyof TraitVector; pos: string; posEmoji: string; neg: string; negEmoji: string }[] = [
  { key: 'ecology',    pos: 'ecology',    posEmoji: '🌱', neg: 'industry',     negEmoji: '🏭' },
  { key: 'militarism', pos: 'militarism', posEmoji: '⚔️', neg: 'pacifism',     negEmoji: '☮️' },
  { key: 'religion',   pos: 'religion',   posEmoji: '⛪', neg: 'secularism',   negEmoji: '⚛️' },
  { key: 'liberty',    pos: 'liberty',    posEmoji: '🗽', neg: 'collectivism', negEmoji: '🌎' },
  { key: 'progress',   pos: 'progress',   posEmoji: '🚀', neg: 'tradition',    negEmoji: '⛩️' },
];

export function MapFilters() {
  const activeOverlay = useUIStore((state) => state.activeOverlay);
  const setActiveOverlay = useUIStore((state) => state.setActiveOverlay);
  const btnStyle = (active: boolean, extraStyle?: React.CSSProperties): React.CSSProperties => ({
    padding: '4px 10px',
    fontFamily: 'monospace',
    fontSize: 12,
    background: active ? '#c0c8d0' : '#1e2d3a',
    color: active ? '#0f1923' : '#c0c8d0',
    border: '1px solid #2a3f50',
    cursor: 'pointer',
    ...extraStyle,
  });

  const handleTrait = (trait: keyof TraitVector) => {
    if (!activeOverlay || activeOverlay.trait !== trait) {
      setActiveOverlay({ trait, inverted: false });
    } else if (!activeOverlay.inverted) {
      setActiveOverlay({ trait, inverted: true });
    } else {
      setActiveOverlay({ trait, inverted: false });
    }
  };

  const handleLoyalty = () => {
    if (activeOverlay?.trait === 'loyalty') {
      setActiveOverlay(null);
    } else {
      setActiveOverlay({ trait: 'loyalty', inverted: false });
    }
  };

  return (
    <>
      <button style={btnStyle(activeOverlay === null)} onClick={() => setActiveOverlay(null)}>
        Default
      </button>
      {TRAIT_META.map(({ key, pos, posEmoji, neg, negEmoji }) => {
        const isActive = activeOverlay?.trait === key;
        const isInverted = isActive && activeOverlay!.inverted;
        return (
          <button
            key={key}
            style={btnStyle(isActive)}
            onClick={() => handleTrait(key)}
          >
            {isInverted ? `${neg} ${negEmoji}` : `${pos} ${posEmoji}`}
          </button>
        );
      })}
      <button
        style={btnStyle(activeOverlay?.trait === 'loyalty')}
        onClick={handleLoyalty}
      >
        loyalty ❤️
      </button>
    </>
  );
}

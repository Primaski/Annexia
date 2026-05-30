import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { Sprite } from './Sprite';
import type { GovernmentType, OwnedTile } from '../../types';
import advisorsData from '../../data/advisors.json';

export function RoundtableOverlay() {
  const phase = useGameStore((state) => state.phase);
  const tiles = useGameStore((state) => state.tiles);
  const tribunes = useGameStore((state) => state.tribunes);
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const addNation = useGameStore((state) => state.addNation);
  const addNotification = useGameStore((state) => state.addNotification);
  const setPhase = useGameStore((state) => state.setPhase);
  const setPendingRoundtable = useGameStore((state) => state.setPendingRoundtable);
  const roundtableOpen = useUIStore((state) => state.roundtableOpen);
  const setRoundtableOpen = useUIStore((state) => state.setRoundtableOpen);

  const [countryName, setCountryName] = useState('');
  const [governmentType, setGovernmentType] = useState<GovernmentType | null>(null);
  const [selectedTribuneIds, setSelectedTribuneIds] = useState<string[]>([]);

  if (phase !== 'roundtable') return null;

  const spawnTile = Object.values(tiles).find(
    (t): t is OwnedTile =>
      t.state === 'owned' &&
      (t as OwnedTile).ownerId === 'player_1' &&
      (t as OwnedTile).activeTroops === 10,
  );
  const spawnTileName = spawnTile?.name ?? '';

  const tribuneLimit =
    governmentType === 'democracy' ? 4
    : governmentType === 'hybrid' || governmentType === 'autocracy' ? 3
    : null;
  const atLimit = tribuneLimit !== null && selectedTribuneIds.length >= tribuneLimit;
  const limitDisplay =
    tribuneLimit !== null ? `(${selectedTribuneIds.length} / ${tribuneLimit} selected)` : '(— / —)';

  const canConfirm = tribuneLimit !== null && selectedTribuneIds.length === tribuneLimit;

  const handleTribuneToggle = (id: string) => {
    if (selectedTribuneIds.includes(id)) {
      setSelectedTribuneIds(selectedTribuneIds.filter((t) => t !== id));
    } else if (!atLimit) {
      setSelectedTribuneIds([...selectedTribuneIds, id]);
    }
  };

  const handleMinimize = () => {
    addNotification({ id: 'roundtable_minimized', text: 'Roundtable pending' });
    setRoundtableOpen(false);
  };

  const handleConfirm = () => {
    if (!canConfirm || !governmentType) return;
    const enteredName = countryName.trim() || spawnTileName;
    addNation({ id: 'nation_player_0', name: enteredName, isBarbarian: false, imagePath: null });
    updatePlayer('player_1', {
      name: enteredName,
      governmentType,
      tribuneIds: selectedTribuneIds,
      nationId: 'nation_player_0',
    });
    setPhase('policy');
    setPendingRoundtable(null);
    setRoundtableOpen(false);
  };

  const advisor = advisorsData[0];

  return (
    <>
      {roundtableOpen && (
        <>
          {/* Map fade — blocks all pointer events when overlay is open */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 15,
              background: 'rgba(0,0,0,0.18)',
              pointerEvents: 'all',
            }}
          />

          {/* Overlay panel */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              width: 480,
              background: '#0f1923',
              border: '1px solid #2a3f50',
              padding: 28,
              fontFamily: 'monospace',
              color: '#c0c8d0',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxSizing: 'border-box',
            }}
          >
            {/* Header row with minimize button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontVariant: 'small-caps', color: '#5a7a8a', fontSize: 13, letterSpacing: '0.1em' }}>
                Roundtable
              </div>
              <button
                onClick={handleMinimize}
                style={{
                  width: 24,
                  height: 24,
                  background: '#1e2d3a',
                  color: '#c0c8d0',
                  border: '1px solid #2a3f50',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                —
              </button>
            </div>

            {/* Country name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: '#5a7a8a' }}>Country Name</label>
              <input
                type="text"
                value={countryName}
                onChange={(e) => setCountryName(e.target.value)}
                placeholder={spawnTileName}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: '#1e2d3a',
                  color: '#c0c8d0',
                  border: '1px solid #2a3f50',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Government type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#5a7a8a' }}>Government Type</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['democracy', 'hybrid', 'autocracy'] as GovernmentType[]).map((type) => {
                  const active = governmentType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setGovernmentType(type);
                        setSelectedTribuneIds([]);
                      }}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        background: active ? '#c0c8d0' : '#1e2d3a',
                        color: active ? '#0f1923' : '#c0c8d0',
                        border: '1px solid #2a3f50',
                        cursor: 'pointer',
                      }}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tribune selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: '#5a7a8a' }}>Select Tribunes</span>
                <span style={{ fontSize: 11, color: '#3a5a6a' }}>{limitDisplay}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {tribunes.map((tribune) => {
                  const isSelected = selectedTribuneIds.includes(tribune.id);
                  const isDisabled = governmentType === null || (!isSelected && atLimit);
                  return (
                    <div
                      key={tribune.id}
                      onClick={isDisabled ? undefined : () => handleTribuneToggle(tribune.id)}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.35 : 1,
                        pointerEvents: isDisabled ? 'none' : 'auto',
                        outline: isSelected ? '2px solid #c0c8d0' : 'none',
                      }}
                    >
                      <Sprite imagePath={tribune.imagePath} name={tribune.name} size={72} />
                      <div style={{ fontSize: 11, color: '#8aa0b0', textAlign: 'center' }}>
                        {tribune.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#5a7a8a', textAlign: 'center', fontFamily: 'monospace', textTransform: 'capitalize' }}>
                        {tribune.archetype.split('_').join(' ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Advisor placeholder */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#5a7a8a' }}>Your Advisor</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Sprite imagePath={advisor.imagePath} name={advisor.name} size={48} />
                <div
                  style={{
                    border: '1px solid #2a3f50',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 13,
                    color: '#c0c8d0',
                  }}
                >
                  {advisor.flavourText}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#5a7a8a' }}>{advisor.name}</div>
            </div>

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={{
                width: '100%',
                padding: '8px 0',
                fontFamily: 'monospace',
                fontSize: 13,
                background: '#1e2d3a',
                color: '#c0c8d0',
                border: '1px solid #2a3f50',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                opacity: canConfirm ? 1 : 0.4,
              }}
            >
              Confirm
            </button>
          </div>
        </>
      )}
    </>
  );
}

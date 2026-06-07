import { useState } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { useUIStore } from '../../../store/uiStore';
import { Sprite } from '../Sprite';
import type { GovernmentType, OwnedTile } from '../../../types';
import advisorsData from '../../../data/advisors.json';
import { DEFAULT_CONFIG } from '../../../config';

export function RoundtablePanel() {
  const tiles              = useGameStore((state) => state.tiles);
  const tribunes           = useGameStore((state) => state.tribunes);
  const players            = useGameStore((state) => state.players);
  const updatePlayer       = useGameStore((state) => state.updatePlayer);
  const addNation          = useGameStore((state) => state.addNation);
  const setPhase           = useGameStore((state) => state.setPhase);
  const setPendingRoundtable = useGameStore((state) => state.setPendingRoundtable);
  const viewingPlayerId    = useUIStore((state) => state.viewingPlayerId);
  const viewingPlayer      = players.find((p) => p.id === viewingPlayerId);

  const [countryName, setCountryName] = useState('');
  const [governmentType, setGovernmentType] = useState<GovernmentType | null>(null);
  const [selectedTribuneIds, setSelectedTribuneIds] = useState<string[]>([]);

  const spawnTile = Object.values(tiles).find(
    (t): t is OwnedTile =>
      t.state === 'owned' &&
      (t as OwnedTile).ownerId === viewingPlayerId &&
      (t as OwnedTile).troops === DEFAULT_CONFIG.mobilization.spawnTroops,
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

  const handleConfirm = () => {
    if (!canConfirm || !governmentType || !viewingPlayerId || !viewingPlayer) return;
    const enteredName = countryName.trim() || spawnTileName;
    addNation({ id: viewingPlayer.nationId!, name: enteredName, isBarbarian: false, imagePath: null });
    updatePlayer(viewingPlayerId, {
      name: enteredName,
      governmentType,
      tribuneIds: selectedTribuneIds,
      nationId: viewingPlayer.nationId!,
      tribuneSentiment: Object.fromEntries(selectedTribuneIds.map((id) => [id, 0])),
    });
    setPhase('policy');
    setPendingRoundtable(null);
  };

  const advisor = advisorsData[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontVariant: 'small-caps', color: '#5a7a8a', fontSize: 15, letterSpacing: '0.1em' }}>
        Roundtable
      </div>

      {/* Country name */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 14, color: '#5a7a8a' }}>Country Name</label>
        <input
          type="text"
          value={countryName}
          onChange={(e) => setCountryName(e.target.value)}
          placeholder={spawnTileName}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: '#1e2d3a',
            color: '#c0c8d0',
            border: '1px solid #2a3f50',
            fontFamily: 'monospace',
            fontSize: 15,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Government type */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14, color: '#5a7a8a' }}>Government Type</div>
        <div style={{ display: 'flex', gap: 10 }}>
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
                  padding: '9px 0',
                  fontFamily: 'monospace',
                  fontSize: 14,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, color: '#5a7a8a' }}>Select Tribunes</span>
          <span style={{ fontSize: 13, color: '#3a5a6a' }}>{limitDisplay}</span>
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
                <Sprite imagePath={tribune.imagePath} name={tribune.name} size={108} zoom={1.2} />
                <div style={{ fontSize: 13, color: '#8aa0b0', textAlign: 'center' }}>
                  {tribune.name}
                </div>
                <div style={{ fontSize: 12, color: '#5a7a8a', textAlign: 'center', textTransform: 'capitalize' }}>
                  {tribune.archetype.split('_').join(' ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advisor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, color: '#5a7a8a' }}>Your Advisor</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Sprite imagePath={advisor.imagePath} name={advisor.name} size={88} zoom={1.2} />
          <div
            style={{
              border: '1px solid #2a3f50',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 15,
              color: '#c0c8d0',
            }}
          >
            {advisor.flavourText}
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#5a7a8a' }}>{advisor.name}</div>
      </div>

      {/* Confirm */}
      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        style={{
          width: '100%',
          padding: '10px 0',
          fontFamily: 'monospace',
          fontSize: 15,
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
  );
}

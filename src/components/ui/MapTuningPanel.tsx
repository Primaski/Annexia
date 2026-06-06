import type { TuningConfig } from '../../config';

export const PANEL_WIDTH = 260; // exported so HexGrid can subtract it

interface SliderDef {
  key: keyof TuningConfig['map'];
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderDef[] = [
  { key: 'landRatio',         label: 'Land Ratio',          min: 0.05, max: 0.95, step: 0.05 },
  { key: 'barbarianFraction', label: 'Barbarian Fraction',  min: 0,    max: 0.8,  step: 0.05 },
  { key: 'voronoiGrain',      label: 'Voronoi Grain',       min: 1,    max: 20,   step: 1    },
  { key: 'noiseScale',        label: 'Island Noise',        min: 0.1,  max: 4,    step: 0.1  },
  { key: 'cultureNoiseScale', label: 'Culture Noise',       min: 0.1,  max: 4,    step: 0.1  },
];

interface Props {
  config: TuningConfig['map'];
  onChange: (config: TuningConfig['map']) => void;
}

export function MapTuningPanel({ config, onChange }: Props) {
  return (
    <div
      style={{
        width: PANEL_WIDTH,
        flexShrink: 0,
        padding: '28px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        color: '#c0c8d0',
        fontFamily: 'monospace',
        fontSize: 12,
        borderLeft: '1px solid #1e2d3a',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontSize: 11, color: '#5a7a8a', letterSpacing: '0.1em' }}>
        MAP TUNING
      </div>

      {SLIDERS.map(({ key, label, min, max, step }) => {
        const value = config[key] as number;
        const display = step >= 1 ? String(value) : value.toFixed(2);
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#8aa0b0' }}>{label}</span>
              <span style={{ color: '#e0e8f0', minWidth: 32, textAlign: 'right' }}>{display}</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) =>
                onChange({ ...config, [key]: parseFloat(e.target.value) })
              }
              style={{ width: '100%', cursor: 'pointer', accentColor: '#4a8fa0' }}
            />
          </div>
        );
      })}
    </div>
  );
}

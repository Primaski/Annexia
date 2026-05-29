# Annexia

A turn-based political strategy game played on a hexagonal map.
Players govern territory and compete to expand through both soft and hard power.
## Stack
TypeScript · React · Vite · Zustand

## Dev Setup
npm install
npm run dev

## Progress
- Map generation complete, leveraging on methodology discussed by [Amit Patel (Red Blob Games)](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/) - generates of Voronoi Polygons, runs Lloyd Relaxation, adds noise and smooths. Debug panel available
- Player and barbarian spawns implemented
- Traits implemented with the following scales
  - Industry -> Ecology
  - Pacifism -> Militarism
  - Secularism -> Religion
  - Collectivism -> Liberty
  - Tradition -> Progress
- Leader trait profiles affect loyalty via MAD (cosine similarity still in place for neighbor tile pressure, needs to be adjusted)
- Basic turn system implemented
- Regions will become barbarian if loyalty falls below 0 (-5000 normally but near impossible to test without complex policy decisions and neighbor pressure available)
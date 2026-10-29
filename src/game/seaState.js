// Rotte marittime in partita: collega i porti reali (livello ≥ 1, data/ports + state.ports) e il controllo delle province al contesto di data/seaRoutes.js.
// Un porto è una provincia madre con almeno una città costiera con porto di livello ≥ 1 nello stato di partita. La zona di mare del porto non è distinta
// (una provincia con due coste conta su entrambe): approssimazione dichiarata. Il contesto legge lo stato PASSATO a `at(state)`; è sincrono e a thread unico.
import { createSeaContext } from '../data/seaRoutes.js';
import { portLevelIn } from './portsState.js';

/**
 * ctx: { seaFile, params (sea_routes_params.json), provinceIds (stesso ordine di sea_zones.json), motherOf(idProvincia) → madre, entityOf(idProvincia) → entità,
 *        ports: { coastal (cittaId → { parentProvince }), base (ports_1936.json) } }
 * Ritorna { at(state) → createSeaContext legato a quello stato, hasPort(state, idProvincia) }.
 */
export function createGameSea({ seaFile, params, provinceIds, motherOf, entityOf, ports }) {
  const citiesOf = new Map();
  for (const [cittaId, c] of Object.entries(ports.coastal)) (citiesOf.get(c.parentProvince) ?? citiesOf.set(c.parentProvince, []).get(c.parentProvince)).push(cittaId);
  const hasPort = (state, provinceId) => (citiesOf.get(motherOf(provinceId)) ?? []).some((id) => portLevelIn(state, ports.base, id) >= 1);
  let current = null;
  const context = createSeaContext({
    seaFile, params, provinceIds,
    ownerOf: (id) => current?.control?.[entityOf(id)],
    portFilter: (id) => (current ? hasPort(current, id) : false),
  });
  return { at: (state) => { current = state; return context; }, hasPort };
}

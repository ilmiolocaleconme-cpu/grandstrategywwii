// Nuovi tentativi per i file di dati caricati a richiesta (import dinamico). Su telefono, con molte richieste insieme o rete debole,
// un import() può fallire una volta: senza nuovi tentativi il livello (città, nomi, risorse, ...) restava vuoto senza alcun avviso.
// Funzione generica e pura (sleep iniettabile per i test).
export async function withRetry(load, { tries = 3, delayMs = 1200, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await load(); } catch (e) { last = e; if (i < tries - 1) await sleep(delayMs * (i + 1)); }
  }
  throw last;
}

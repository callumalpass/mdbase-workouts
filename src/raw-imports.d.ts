/** Vite imports a file as text with the `?raw` suffix. */
declare module "*?raw" {
  const source: string;
  export default source;
}

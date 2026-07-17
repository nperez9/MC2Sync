// Vite handles CSS imports — tell TypeScript to allow them
declare module '*.css' {
  const content: string;
  export default content;
}

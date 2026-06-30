// Allow importing CSS files in TypeScript (Next.js handles the actual processing)
declare module '*.css' {
  const content: string;
  export default content;
}

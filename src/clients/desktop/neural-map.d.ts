declare module '@brain-map' {
  const map: {
    neurons: number;
    edges: number;
    groups: { id: number; name: string; region: string; neurons: number }[];
    links: { source: number; target: number; count: number }[];
  };
  export default map;
}

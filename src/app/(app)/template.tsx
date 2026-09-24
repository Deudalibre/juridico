// Cada pantalla se monta dentro de .page (separación y animación de entrada)
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}

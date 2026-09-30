import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <Link href="/revision" className="link-muted">
        ← Volver a Revisión
      </Link>
      <PageTitle title="No encontrado" subtitle="Esta causa, plantilla o página no existe o fue eliminada." />
    </>
  );
}

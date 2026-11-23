import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">Jamie <span>dashboard</span></Link>
          <nav className="nav" aria-label="Main">
            <Link href="/">Overview</Link>
            <Link href="/entrepreneur">Entrepreneur</Link>
            <Link href="/applications">Applications</Link>
            <Link href="/lessons">Lessons &amp; handoffs</Link>
            <Link href="/db">Database</Link>
          </nav>
          <form action={logout}>
            <button className="linkbtn" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
